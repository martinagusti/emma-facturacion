const { randomUUID } = require("crypto");
const { pool } = require("../db/pool");

const STATUS_VALUES = new Set(["pendiente", "facturaEnviada", "pagado", "cancelado"]);
const ROLE_VALUES = new Set(["admin", "comercial", "usuario"]);
const PERIOD_VALUES = new Set(["unico", "mensual", "anual"]);

const RESOURCE_KEYS = {
  users: "ov_users",
  clients: "ov_clients",
  payments: "ov_payments",
  deletedClients: "ov_deleted_clients",
  commercials: "ov_comerciales",
  invoices: "ov_invoices",
  lastResponsable: "ov_last_responsable"
};

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === "") {
    return fallback;
  }
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function parseStorageValue(rawValue, fallback, label) {
  if (rawValue == null || rawValue === "") {
    return fallback;
  }
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`Invalid JSON payload for ${label}`);
  }
}

function toStringValue(value, fallback = "") {
  if (value == null) {
    return fallback;
  }
  return String(value);
}

function toNullableString(value) {
  const text = toStringValue(value).trim();
  return text ? text : null;
}

function toEmail(value) {
  return toStringValue(value).trim().toLowerCase();
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toOptionalInt(value) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateInput(value) {
  if (value == null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = toStringValue(value).trim();
  if (!text) {
    return null;
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      year: isoMatch[1],
      month: isoMatch[2],
      day: isoMatch[3]
    };
  }
  const monthKeyMatch = text.match(/^(\d{4})-(\d{2})$/);
  if (monthKeyMatch) {
    return {
      year: monthKeyMatch[1],
      month: monthKeyMatch[2],
      day: null
    };
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toDateOnly(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    return null;
  }
  if (normalized instanceof Date) {
    return [normalized.getFullYear(), padDatePart(normalized.getMonth() + 1), padDatePart(normalized.getDate())].join("-");
  }
  if (!normalized.day) {
    return null;
  }
  return [normalized.year, normalized.month, normalized.day].join("-");
}

function toMonthKey(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    return null;
  }
  if (normalized instanceof Date) {
    return [normalized.getFullYear(), padDatePart(normalized.getMonth() + 1)].join("-");
  }
  return [normalized.year, normalized.month].join("-");
}

function toDateTime(value) {
  if (!value) {
    return new Date();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeRole(value) {
  const role = toStringValue(value, "usuario");
  return ROLE_VALUES.has(role) ? role : "usuario";
}

function normalizeStatus(value) {
  const status = toStringValue(value, "pendiente");
  return STATUS_VALUES.has(status) ? status : "pendiente";
}

function normalizePeriod(value) {
  const period = toStringValue(value, "unico");
  return PERIOD_VALUES.has(period) ? period : "unico";
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function clearTable(connection, tableName) {
  await connection.query(`DELETE FROM ${tableName}`);
}

async function insertMany(connection, sql, rows) {
  if (!rows.length) {
    return;
  }
  await connection.query(sql, [rows]);
}

async function fetchUsers(connection = pool) {
  const [rows] = await connection.query(
    `SELECT id, email, password_hash, role, is_admin, pending_activation, display_name, commercial_name, created_by_email, created_at
     FROM users
     ORDER BY email ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    passHash: row.password_hash || "",
    pendingActivation: !!row.pending_activation,
    role: row.role,
    isAdmin: !!row.is_admin,
    name: row.display_name || row.email.split("@")[0],
    commercialName: row.commercial_name || "",
    createdBy: row.created_by_email || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ""
  }));
}

async function replaceUsers(connection, rawValue) {
  const users = ensureArray(parseStorageValue(rawValue, [], "ov_users"), "ov_users");
  await clearTable(connection, "users");
  const rows = users.map((user) => {
    const email = toEmail(user.email);
    const role = normalizeRole(user.role || (user.isAdmin ? "admin" : "usuario"));
    return [
      toStringValue(user.id || randomUUID()),
      email,
      toStringValue(user.passHash || ""),
      role,
      toBoolean(user.isAdmin || role === "admin") ? 1 : 0,
      toBoolean(user.pendingActivation) ? 1 : 0,
      toStringValue(user.name || email.split("@")[0]),
      toNullableString(user.commercialName),
      toNullableString(user.createdBy),
      toDateTime(user.createdAt)
    ];
  });
  await insertMany(
    connection,
    `INSERT INTO users
      (id, email, password_hash, role, is_admin, pending_activation, display_name, commercial_name, created_by_email, created_at)
     VALUES ?`,
    rows
  );
}

async function fetchCommercials(connection = pool) {
  const [rows] = await connection.query(
    `SELECT id, name, color
     FROM commercials
     ORDER BY name ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color
  }));
}

async function replaceCommercials(connection, rawValue) {
  const commercials = ensureArray(parseStorageValue(rawValue, [], "ov_comerciales"), "ov_comerciales");
  await clearTable(connection, "commercials");
  const rows = commercials.map((commercial) => [
    toStringValue(commercial.id || randomUUID()),
    toStringValue(commercial.name).trim(),
    toStringValue(commercial.color || "#2563EB").trim()
  ]);
  await insertMany(connection, `INSERT INTO commercials (id, name, color) VALUES ?`, rows);
}

async function fetchClients(connection = pool) {
  const [clients] = await connection.query(
    `SELECT id, legal_name, trade_name, contact_name, contact_email, contact_phone, billing_day, responsible_name,
            default_payment_method, start_date, notes, is_active
     FROM clients
     ORDER BY trade_name ASC, legal_name ASC`
  );
  const [services] = await connection.query(
    `SELECT client_id, service_key, price, billing_period, service_status, payment_method, service_date, custom_label, start_month
     FROM client_services
     ORDER BY client_id ASC, service_key ASC`
  );

  const byClientId = new Map();
  clients.forEach((client) => {
    byClientId.set(client.id, {
      id: client.id,
      razonSocial: client.legal_name,
      nombreComercial: client.trade_name,
      contactoNombre: client.contact_name || "",
      contactoEmail: client.contact_email || "",
      contactoTel: client.contact_phone || "",
      cobroDia: client.billing_day == null ? "" : String(client.billing_day),
      responsable: client.responsible_name || "",
      formaCobro: client.default_payment_method || "",
      fechaAlta: client.start_date ? toDateOnly(client.start_date) : "",
      active: !!client.is_active,
      services: {},
      notas: client.notes || ""
    });
  });

  services.forEach((service) => {
    const client = byClientId.get(service.client_id);
    if (!client) {
      return;
    }
    client.services[service.service_key] = {
      price: toMoney(service.price),
      period: normalizePeriod(service.billing_period),
      status: normalizeStatus(service.service_status),
      formaCobro: service.payment_method || "",
      fecha: service.service_date ? toDateOnly(service.service_date) : "",
      otrosLabel: service.custom_label || "",
      startMonth: service.start_month || ""
    };
  });

  return Array.from(byClientId.values());
}

async function replaceClients(connection, rawValue) {
  const clients = ensureArray(parseStorageValue(rawValue, [], "ov_clients"), "ov_clients");
  await clearTable(connection, "client_services");
  await clearTable(connection, "clients");

  const clientRows = clients.map((client) => [
    toStringValue(client.id || randomUUID()),
    toStringValue(client.razonSocial),
    toStringValue(client.nombreComercial || client.razonSocial),
    toNullableString(client.contactoNombre),
    toNullableString(client.contactoEmail),
    toNullableString(client.contactoTel),
    toOptionalInt(client.cobroDia),
    toNullableString(client.responsable),
    toNullableString(client.formaCobro),
    toDateOnly(client.fechaAlta),
    toNullableString(client.notas),
    toBoolean(client.active === undefined ? true : client.active) ? 1 : 0
  ]);

  await insertMany(
    connection,
    `INSERT INTO clients
      (id, legal_name, trade_name, contact_name, contact_email, contact_phone, billing_day, responsible_name,
       default_payment_method, start_date, notes, is_active)
     VALUES ?`,
    clientRows
  );

  const serviceRows = [];
  clients.forEach((client) => {
    const services = ensureObject(client.services || {}, `services for client ${client.id}`);
    Object.keys(services).forEach((serviceKey) => {
      const service = services[serviceKey] || {};
      serviceRows.push([
        toStringValue(client.id),
        toStringValue(serviceKey),
        toMoney(service.price),
        normalizePeriod(service.period),
        normalizeStatus(service.status),
        toNullableString(service.formaCobro),
        toDateOnly(service.fecha),
        toNullableString(service.otrosLabel),
        toMonthKey(service.startMonth)
      ]);
    });
  });

  await insertMany(
    connection,
    `INSERT INTO client_services
      (client_id, service_key, price, billing_period, service_status, payment_method, service_date, custom_label, start_month)
     VALUES ?`,
    serviceRows
  );
}

async function fetchPayments(connection = pool) {
  const [payments] = await connection.query(
    `SELECT client_id, month_key, amount, status, payment_method, paid_date, notes
     FROM payments
     ORDER BY client_id ASC, month_key ASC`
  );
  const [serviceStatuses] = await connection.query(
    `SELECT client_id, month_key, service_key, status
     FROM payment_service_statuses
     ORDER BY client_id ASC, month_key ASC, service_key ASC`
  );

  const result = {};
  payments.forEach((payment) => {
    if (!result[payment.client_id]) {
      result[payment.client_id] = {};
    }
    result[payment.client_id][payment.month_key] = {
      importe: toMoney(payment.amount),
      status: normalizeStatus(payment.status),
      formaCobro: payment.payment_method || "",
      fecha: payment.paid_date ? toDateOnly(payment.paid_date) : "",
      serviceStatus: {},
      notas: payment.notes || ""
    };
  });

  serviceStatuses.forEach((statusRow) => {
    const payment = result[statusRow.client_id] && result[statusRow.client_id][statusRow.month_key];
    if (!payment) {
      return;
    }
    payment.serviceStatus[statusRow.service_key] = normalizeStatus(statusRow.status);
  });

  return result;
}

async function replacePayments(connection, rawValue) {
  const payments = ensureObject(parseStorageValue(rawValue, {}, "ov_payments"), "ov_payments");
  await clearTable(connection, "payment_service_statuses");
  await clearTable(connection, "payments");

  const paymentRows = [];
  const serviceStatusRows = [];

  Object.keys(payments).forEach((clientId) => {
    const monthMap = ensureObject(payments[clientId] || {}, `payments for client ${clientId}`);
    Object.keys(monthMap).forEach((monthKey) => {
      const payment = monthMap[monthKey] || {};
      paymentRows.push([
        toStringValue(clientId),
        toMonthKey(monthKey),
        toMoney(payment.importe),
        normalizeStatus(payment.status),
        toNullableString(payment.formaCobro),
        toDateOnly(payment.fecha),
        toNullableString(payment.notas)
      ]);

      const perService = ensureObject(payment.serviceStatus || {}, `serviceStatus for ${clientId} ${monthKey}`);
      Object.keys(perService).forEach((serviceKey) => {
        serviceStatusRows.push([
          toStringValue(clientId),
          toMonthKey(monthKey),
          toStringValue(serviceKey),
          normalizeStatus(perService[serviceKey])
        ]);
      });
    });
  });

  await insertMany(
    connection,
    `INSERT INTO payments
      (client_id, month_key, amount, status, payment_method, paid_date, notes)
     VALUES ?`,
    paymentRows
  );

  await insertMany(
    connection,
    `INSERT INTO payment_service_statuses
      (client_id, month_key, service_key, status)
     VALUES ?`,
    serviceStatusRows
  );
}

async function fetchInvoices(connection = pool) {
  const [rows] = await connection.query(
    `SELECT id, client_id, service_key, concept, description, amount, status, issue_date, due_date, month_key, payment_day,
            billing_period, billing_duration, payment_method, responsible_name, service_keys_json, pack_price_mode,
            pack_items_json, split_group_id, split_index, split_total, project_total, recurrence_root_id, source_invoice_id,
            origin_key, cancel_after_month, paid_at, created_at
     FROM invoices
     ORDER BY month_key DESC, due_date DESC, created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id || "",
    serviceKey: row.service_key || "otros",
    concept: row.concept || "",
    description: row.description || "",
    amount: toMoney(row.amount),
    status: normalizeStatus(row.status),
    issueDate: row.issue_date ? toDateOnly(row.issue_date) : "",
    dueDate: row.due_date ? toDateOnly(row.due_date) : "",
    month: row.month_key || "",
    paymentDay: row.payment_day == null ? "" : row.payment_day,
    period: normalizePeriod(row.billing_period),
    billingDuration: row.billing_duration || "",
    formaCobro: row.payment_method || "",
    responsable: row.responsible_name || "",
    serviceKeys: safeJsonParse(row.service_keys_json, []),
    packPriceMode: row.pack_price_mode || "",
    packItems: safeJsonParse(row.pack_items_json, []),
    splitGroupId: row.split_group_id || "",
    splitIndex: row.split_index == null ? undefined : row.split_index,
    splitTotal: row.split_total == null ? undefined : row.split_total,
    projectTotal: row.project_total == null ? undefined : toMoney(row.project_total),
    recurrenceRootId: row.recurrence_root_id || "",
    sourceInvoiceId: row.source_invoice_id || "",
    originKey: row.origin_key || "",
    cancelAfterMonth: row.cancel_after_month || "",
    paidAt: row.paid_at ? toDateOnly(row.paid_at) : "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ""
  }));
}

async function replaceInvoices(connection, rawValue) {
  const invoices = ensureArray(parseStorageValue(rawValue, [], "ov_invoices"), "ov_invoices");
  await clearTable(connection, "invoices");
  const rows = invoices.map((invoice) => [
    toStringValue(invoice.id || randomUUID()),
    toNullableString(invoice.clientId),
    toStringValue(invoice.serviceKey || "otros"),
    toNullableString(invoice.concept),
    toNullableString(invoice.description),
    toMoney(invoice.amount || invoice.importe),
    normalizeStatus(invoice.status),
    toDateOnly(invoice.issueDate || invoice.fechaFactura),
    toDateOnly(invoice.dueDate || invoice.fechaVencimiento),
    toMonthKey(invoice.month),
    toOptionalInt(invoice.paymentDay),
    normalizePeriod(invoice.period || invoice.periodicidad),
    toNullableString(invoice.billingDuration || invoice.facturacionPeriodo),
    toNullableString(invoice.formaCobro),
    toNullableString(invoice.responsable),
    JSON.stringify(Array.isArray(invoice.serviceKeys) ? invoice.serviceKeys : []),
    toNullableString(invoice.packPriceMode),
    JSON.stringify(Array.isArray(invoice.packItems) ? invoice.packItems : []),
    toNullableString(invoice.splitGroupId),
    toOptionalInt(invoice.splitIndex),
    toOptionalInt(invoice.splitTotal),
    invoice.projectTotal == null ? null : toMoney(invoice.projectTotal),
    toNullableString(invoice.recurrenceRootId),
    toNullableString(invoice.sourceInvoiceId),
    toNullableString(invoice.originKey),
    toMonthKey(invoice.cancelAfterMonth),
    toDateOnly(invoice.paidAt || invoice.paidDate || invoice.fechaPago),
    toDateTime(invoice.createdAt)
  ]);
  await insertMany(
    connection,
    `INSERT INTO invoices
      (id, client_id, service_key, concept, description, amount, status, issue_date, due_date, month_key, payment_day,
       billing_period, billing_duration, payment_method, responsible_name, service_keys_json, pack_price_mode,
       pack_items_json, split_group_id, split_index, split_total, project_total, recurrence_root_id, source_invoice_id,
       origin_key, cancel_after_month, paid_at, created_at)
     VALUES ?`,
    rows
  );
}

async function fetchDeletedClients(connection = pool) {
  const [rows] = await connection.query(
    `SELECT client_id, client_json, payments_json, deleted_at, deleted_by_email
     FROM deleted_client_snapshots
     ORDER BY deleted_at DESC`
  );
  return rows.map((row) => ({
    client: safeJsonParse(row.client_json, { id: row.client_id }),
    payments: safeJsonParse(row.payments_json, {}),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : "",
    deletedBy: row.deleted_by_email || ""
  }));
}

async function replaceDeletedClients(connection, rawValue) {
  const items = ensureArray(parseStorageValue(rawValue, [], "ov_deleted_clients"), "ov_deleted_clients");
  await clearTable(connection, "deleted_client_snapshots");
  const rows = items.map((item) => {
    const client = item.client || {};
    return [
      toStringValue(client.id || randomUUID()),
      JSON.stringify(client),
      JSON.stringify(item.payments || {}),
      toDateTime(item.deletedAt || item.deleted_at),
      toNullableString(item.deletedBy || item.deleted_by)
    ];
  });
  await insertMany(
    connection,
    `INSERT INTO deleted_client_snapshots
      (client_id, client_json, payments_json, deleted_at, deleted_by_email)
     VALUES ?`,
    rows
  );
}

async function fetchSetting(key, connection = pool) {
  const [rows] = await connection.query(
    `SELECT setting_value
     FROM app_settings
     WHERE setting_key = ?`,
    [key]
  );
  return rows.length ? rows[0].setting_value : null;
}

async function replaceSetting(connection, key, value) {
  await connection.query(
    `REPLACE INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)`,
    [key, value == null ? null : String(value)]
  );
}

async function getStorageValue(key) {
  switch (key) {
    case RESOURCE_KEYS.users:
      return { value: JSON.stringify(await fetchUsers()) };
    case RESOURCE_KEYS.clients:
      return { value: JSON.stringify(await fetchClients()) };
    case RESOURCE_KEYS.payments:
      return { value: JSON.stringify(await fetchPayments()) };
    case RESOURCE_KEYS.deletedClients:
      return { value: JSON.stringify(await fetchDeletedClients()) };
    case RESOURCE_KEYS.commercials:
      return { value: JSON.stringify(await fetchCommercials()) };
    case RESOURCE_KEYS.invoices:
      return { value: JSON.stringify(await fetchInvoices()) };
    default:
      return { value: await fetchSetting(key) };
  }
}

async function setStorageValue(key, value) {
  return withTransaction(async (connection) => {
    switch (key) {
      case RESOURCE_KEYS.users:
        await replaceUsers(connection, value);
        break;
      case RESOURCE_KEYS.clients:
        await replaceClients(connection, value);
        break;
      case RESOURCE_KEYS.payments:
        await replacePayments(connection, value);
        break;
      case RESOURCE_KEYS.deletedClients:
        await replaceDeletedClients(connection, value);
        break;
      case RESOURCE_KEYS.commercials:
        await replaceCommercials(connection, value);
        break;
      case RESOURCE_KEYS.invoices:
        await replaceInvoices(connection, value);
        break;
      default:
        await replaceSetting(connection, key, value);
        break;
    }
    return { ok: true };
  });
}

async function getResourceSnapshot(resourceName) {
  switch (resourceName) {
    case "users":
      return fetchUsers();
    case "clients":
      return fetchClients();
    case "payments":
      return fetchPayments();
    case "deletedClients":
      return fetchDeletedClients();
    case "commercials":
      return fetchCommercials();
    case "invoices":
      return fetchInvoices();
    case "lastResponsable":
      return fetchSetting(RESOURCE_KEYS.lastResponsable);
    default:
      throw new Error(`Unknown resource: ${resourceName}`);
  }
}

async function setResourceSnapshot(resourceName, payload) {
  const key = RESOURCE_KEYS[resourceName];
  if (!key) {
    throw new Error(`Unknown resource: ${resourceName}`);
  }
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  return setStorageValue(key, serialized);
}

async function getBootstrapPayload() {
  const [users, clients, payments, deletedClients, commercials, invoices, lastResponsable] = await Promise.all([
    fetchUsers(),
    fetchClients(),
    fetchPayments(),
    fetchDeletedClients(),
    fetchCommercials(),
    fetchInvoices(),
    fetchSetting(RESOURCE_KEYS.lastResponsable)
  ]);

  return {
    users,
    clients,
    payments,
    deletedClients,
    commercials,
    invoices,
    lastResponsable: lastResponsable || ""
  };
}


async function getUserByEmail(email, connection = pool) {
  const normalizedEmail = toEmail(email);
  const [rows] = await connection.query(
    `SELECT id, email, password_hash, role, is_admin, pending_activation, display_name, commercial_name, created_by_email, created_at
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [normalizedEmail]
  );
  if (!rows.length) {
    return null;
  }
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    passHash: row.password_hash || "",
    pendingActivation: !!row.pending_activation,
    role: row.role,
    isAdmin: !!row.is_admin,
    name: row.display_name || row.email.split("@")[0],
    commercialName: row.commercial_name || "",
    createdBy: row.created_by_email || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : ""
  };
}

async function upsertUser(user) {
  const role = normalizeRole(user.role || (user.isAdmin ? "admin" : "usuario"));
  const payload = [
    toStringValue(user.id || randomUUID()),
    toEmail(user.email),
    toStringValue(user.passHash || ""),
    role,
    toBoolean(user.isAdmin || role === "admin") ? 1 : 0,
    toBoolean(user.pendingActivation) ? 1 : 0,
    toStringValue(user.name || String(user.email || "").split("@")[0]),
    toNullableString(user.commercialName),
    toNullableString(user.createdBy),
    toDateTime(user.createdAt)
  ];

  await pool.query(
    `INSERT INTO users
      (id, email, password_hash, role, is_admin, pending_activation, display_name, commercial_name, created_by_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       is_admin = VALUES(is_admin),
       pending_activation = VALUES(pending_activation),
       display_name = VALUES(display_name),
       commercial_name = VALUES(commercial_name),
       created_by_email = VALUES(created_by_email)`,
    payload
  );

  return getUserByEmail(user.email);
}

async function deleteUserByEmail(email) {
  await pool.query(`DELETE FROM users WHERE email = ?`, [toEmail(email)]);
}

module.exports = {
  RESOURCE_KEYS,
  deleteUserByEmail,
  getBootstrapPayload,
  getResourceSnapshot,
  getStorageValue,
  getUserByEmail,
  setResourceSnapshot,
  setStorageValue,
  upsertUser
};
