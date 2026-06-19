const express = require("express");
const storageService = require("../services/storage-service");
const authService = require("../services/auth-service");
const { env } = require("../config/env");

const router = express.Router();

function sendError(res, error, statusCode) {
  res.status(statusCode || 400).json({
    error: error.message || "Unexpected error"
  });
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return sendError(res, new Error("Token requerido"), 401);
    }
    const payload = authService.verifyToken(token);
    const user = await storageService.getUserByEmail(payload.email);
    if (!user) {
      return sendError(res, new Error("Usuario no encontrado"), 401);
    }
    req.auth = { token, payload, user: authService.sanitizeUser(user) };
    next();
  } catch (error) {
    return sendError(res, error, 401);
  }
}

router.get("/health", async (_req, res) => {
  res.json({ ok: true, service: "emma-api" });
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = req.body ? String(req.body.email || "").trim().toLowerCase() : "";
    const password = req.body ? String(req.body.password || "") : "";
    if (!email || !password) {
      throw new Error("Rellena todos los campos");
    }
    const user = await storageService.getUserByEmail(email);
    if (!user) {
      throw new Error("Email o contrase?a incorrectos");
    }
    if (user.pendingActivation) {
      throw new Error("Tu acceso est? pendiente. Ve a Crear cuenta con este email para activar tu contrase?a.");
    }
    if (user.passHash !== authService.hashPassword(password)) {
      throw new Error("Email o contrase?a incorrectos");
    }
    const safeUser = authService.sanitizeUser(user);
    res.json({ token: authService.createToken(safeUser), user: safeUser });
  } catch (error) {
    sendError(res, error, 401);
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const email = req.body ? String(req.body.email || "").trim().toLowerCase() : "";
    const password = req.body ? String(req.body.password || "") : "";
    const password2 = req.body ? String(req.body.password2 || "") : "";
    const adminKey = req.body ? String(req.body.adminKey || "") : "";

    if (!email || !password) {
      throw new Error("Rellena email y contrase?a");
    }
    if (password !== password2) {
      throw new Error("Las contrase?as no coinciden");
    }
    if (password.length < 6) {
      throw new Error("M?nimo 6 caracteres");
    }

    const existing = await storageService.getUserByEmail(email);
    if (existing) {
      if (existing.pendingActivation) {
        const updated = await storageService.upsertUser({
          id: existing.id,
          email: existing.email,
          passHash: authService.hashPassword(password),
          pendingActivation: false,
          role: existing.role,
          isAdmin: existing.isAdmin,
          name: email.split("@")[0],
          commercialName: existing.commercialName || "",
          createdBy: existing.createdBy || "",
          createdAt: existing.createdAt || new Date().toISOString()
        });
        return res.json({ ok: true, message: "Cuenta activada. Ya puedes entrar.", user: authService.sanitizeUser(updated) });
      }
      throw new Error("Ese email ya existe");
    }

    const isAdmin = !!env.adminRegistrationKey && adminKey === env.adminRegistrationKey;
    const created = await storageService.upsertUser({
      email,
      passHash: authService.hashPassword(password),
      pendingActivation: false,
      role: isAdmin ? "admin" : "usuario",
      isAdmin,
      name: email.split("@")[0],
      createdAt: new Date().toISOString()
    });

    res.json({ ok: true, message: "Cuenta creada. Ya puedes entrar.", user: authService.sanitizeUser(created) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/auth/admin-role-check", async (req, res) => {
  try {
    const adminKey = req.body ? String(req.body.adminKey || "") : "";
    res.json({
      isAdmin: !!env.adminRegistrationKey && adminKey === env.adminRegistrationKey
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ user: req.auth.user });
});

router.post("/auth/logout", requireAuth, async (_req, res) => {
  res.status(204).end();
});

router.use(requireAuth);

router.get("/bootstrap", async (_req, res) => {
  try {
    res.json(await storageService.getBootstrapPayload());
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/storage/:key", async (req, res) => {
  try {
    res.json(await storageService.getStorageValue(req.params.key));
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/storage/:key", async (req, res) => {
  try {
    const value = req.body ? req.body.value : undefined;
    await storageService.setStorageValue(req.params.key, value);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

[
  "users",
  "clients",
  "payments",
  "deletedClients",
  "commercials",
  "invoices",
  "lastResponsable"
].forEach((resourceName) => {
  router.get(`/${resourceName}`, async (_req, res) => {
    try {
      res.json(await storageService.getResourceSnapshot(resourceName));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put(`/${resourceName}`, async (req, res) => {
    try {
      await storageService.setResourceSnapshot(resourceName, req.body);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });
});

module.exports = { apiRouter: router };
