import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { createHttpError } from "./errorHandling.js";

const adminSessionCookieName = "admin_session";
const monitorSessionCookieName = "monitor_session";

type AdminSessionCookie = {
  sessionId: string;
  expiresAt: number;
  version: string;
  signature: string;
};

type SessionOptions = {
  cookieName: string;
  passwordHash: string;
  sessionSecret: string;
  sessionVersion: string;
  ttlHours: number;
};

function getSessionMaxAgeMs(ttlHours: number) {
  return ttlHours * 60 * 60 * 1000;
}

function getSessionVersion(passwordHash: string, sessionVersion: string) {
  const passwordFingerprint = createHash("sha256")
    .update(passwordHash)
    .digest("hex")
    .slice(0, 16);

  return `${sessionVersion}:${passwordFingerprint}`;
}

function getAdminSessionOptions(): SessionOptions {
  return {
    cookieName: adminSessionCookieName,
    passwordHash: config.ADMIN_PASSWORD_HASH,
    sessionSecret: config.ADMIN_SESSION_SECRET,
    sessionVersion: config.ADMIN_SESSION_VERSION,
    ttlHours: config.ADMIN_SESSION_TTL_HOURS
  };
}

function getMonitorSessionOptions(): SessionOptions {
  return {
    cookieName: monitorSessionCookieName,
    passwordHash: config.MONITOR_PASSWORD_HASH || config.ADMIN_PASSWORD_HASH,
    sessionSecret: config.MONITOR_SESSION_SECRET || config.ADMIN_SESSION_SECRET,
    sessionVersion: config.MONITOR_SESSION_VERSION,
    ttlHours: config.MONITOR_SESSION_TTL_HOURS
  };
}

function encodeAdminSession(session: AdminSessionCookie) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function signSession(
  session: Pick<AdminSessionCookie, "sessionId" | "expiresAt" | "version">,
  sessionSecret: string
) {
  return createHmac("sha256", sessionSecret)
    .update(`${session.sessionId}.${session.expiresAt}.${session.version}`)
    .digest("hex");
}

function decodeAdminSession(value: string): AdminSessionCookie | null {
  try {
    const session = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AdminSessionCookie>;

    if (
      typeof session.sessionId !== "string" ||
      session.sessionId.length !== 64 ||
      typeof session.expiresAt !== "number" ||
      !Number.isFinite(session.expiresAt) ||
      typeof session.version !== "string" ||
      typeof session.signature !== "string"
    ) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      version: session.version,
      signature: session.signature
    };
  } catch {
    return null;
  }
}

function getSignedSessionId(req: Parameters<RequestHandler>[0], cookieName: string) {
  const signedCookies = req.signedCookies as Record<string, string | undefined> | undefined;
  return signedCookies?.[cookieName];
}

function isValidSession(req: Parameters<RequestHandler>[0], options: SessionOptions) {
  const signedSession = getSignedSessionId(req, options.cookieName);

  if (!signedSession) {
    return false;
  }

  const session = decodeAdminSession(signedSession);

  if (!session) {
    return false;
  }

  const expectedSignature = signSession(session, options.sessionSecret);

  return (
    session.expiresAt > Date.now() &&
    session.version === getSessionVersion(options.passwordHash, options.sessionVersion) &&
    isMatchingHex(session.signature, expectedSignature)
  );
}

function isValidAdminSession(req: Parameters<RequestHandler>[0]) {
  return isValidSession(req, getAdminSessionOptions());
}

function isValidMonitorSession(req: Parameters<RequestHandler>[0]) {
  return isValidSession(req, getMonitorSessionOptions());
}

export function isAdminAuthenticated(req: Parameters<RequestHandler>[0]) {
  return isValidAdminSession(req);
}

export function isMonitorAuthenticated(req: Parameters<RequestHandler>[0]) {
  return isValidMonitorSession(req);
}

function getCsrfToken(req: Parameters<RequestHandler>[0], options: SessionOptions) {
  const signedSession = getSignedSessionId(req, options.cookieName);

  if (!signedSession || !isValidSession(req, options)) {
    return null;
  }

  return createHmac("sha256", options.sessionSecret).update(signedSession).digest("hex");
}

export function getAdminCsrfToken(req: Parameters<RequestHandler>[0]) {
  return getCsrfToken(req, getAdminSessionOptions());
}

export function getMonitorCsrfToken(req: Parameters<RequestHandler>[0]) {
  return getCsrfToken(req, getMonitorSessionOptions());
}

function isMatchingHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyPassword(password: string, passwordHash: string) {
  const isMatch = await bcrypt.compare(password, passwordHash);

  if (!isMatch) {
    const dummy = "$2b$12$C6UzMDM.H6dfI/f/IKcEeOZ21YQec4q2nFiULa46Nhkn3Vthk7Yne";
    await bcrypt.compare(password, dummy);
  }

  return isMatch;
}

export function verifyAdminPassword(password: string) {
  return verifyPassword(password, config.ADMIN_PASSWORD_HASH);
}

export function verifyMonitorPassword(password: string) {
  return verifyPassword(password, getMonitorSessionOptions().passwordHash);
}

function createSession(res: Parameters<RequestHandler>[1], options: SessionOptions) {
  const sessionId = randomBytes(32).toString("hex");
  const maxAge = getSessionMaxAgeMs(options.ttlHours);
  const unsignedSession = {
    sessionId,
    expiresAt: Date.now() + maxAge,
    version: getSessionVersion(options.passwordHash, options.sessionVersion)
  };
  const session = encodeAdminSession({
    ...unsignedSession,
    signature: signSession(unsignedSession, options.sessionSecret)
  });

  res.cookie(options.cookieName, session, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge,
    path: "/"
  });
}

export function createAdminSession(res: Parameters<RequestHandler>[1]) {
  createSession(res, getAdminSessionOptions());
}

export function createMonitorSession(res: Parameters<RequestHandler>[1]) {
  createSession(res, getMonitorSessionOptions());
}

function clearSession(res: Parameters<RequestHandler>[1], options: SessionOptions) {
  res.clearCookie(options.cookieName, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/"
  });
}

export function clearAdminSession(
  _req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
) {
  clearSession(res, getAdminSessionOptions());
}

export function clearMonitorSession(
  _req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
) {
  clearSession(res, getMonitorSessionOptions());
}

export const requireAdminAuth: RequestHandler = (req, _res, next) => {
  if (isValidAdminSession(req)) {
    next();
    return;
  }

  next(createHttpError(401, "Admin login is required", "ADMIN_AUTH_REQUIRED"));
};

export const requireMonitorAuth: RequestHandler = (req, _res, next) => {
  if (isValidMonitorSession(req)) {
    next();
    return;
  }

  next(createHttpError(401, "Monitor login is required", "MONITOR_AUTH_REQUIRED"));
};

function requireCsrf(
  req: Parameters<RequestHandler>[0],
  next: Parameters<RequestHandler>[2],
  expectedToken: string | null,
  message: string,
  code: string
) {
  const providedToken = req.header("x-csrf-token");

  if (
    expectedToken &&
    providedToken &&
    /^[a-f0-9]{64}$/i.test(providedToken) &&
    isMatchingHex(expectedToken, providedToken)
  ) {
    next();
    return;
  }

  next(createHttpError(403, message, code));
}

export const requireAdminCsrf: RequestHandler = (req, _res, next) => {
  requireCsrf(
    req,
    next,
    getAdminCsrfToken(req),
    "Admin CSRF token is invalid or missing",
    "ADMIN_CSRF_REQUIRED"
  );
};

export const requireMonitorCsrf: RequestHandler = (req, _res, next) => {
  requireCsrf(
    req,
    next,
    getMonitorCsrfToken(req),
    "Monitor CSRF token is invalid or missing",
    "MONITOR_CSRF_REQUIRED"
  );
};
