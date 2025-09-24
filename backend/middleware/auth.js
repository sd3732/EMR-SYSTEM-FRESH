import jwt from 'jsonwebtoken';
import pool from '../db/index.js';

// Rate limiting store for failed login attempts
const loginAttempts = new Map();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided in request');
    return res.status(401).json({ ok: false, error: 'No token provided' });
  }

  // Use the same secret defined at module level

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification failed:', err.message);

      // SECURITY: NO development bypasses for token expiration - HIPAA compliance requires strict token validation

      return res.status(403).json({
        ok: false,
        error: err.name === 'TokenExpiredError' ? 'Token expired - please login again' : 'Invalid token'
      });
    }

    req.user = user;
    next();
  });
};

// Rate limiting middleware for login attempts
export const rateLimitLogin = (req, res, next) => {
  const clientKey = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  if (!loginAttempts.has(clientKey)) {
    loginAttempts.set(clientKey, []);
  }

  const attempts = loginAttempts.get(clientKey);
  
  // Remove attempts older than the window
  const validAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
  loginAttempts.set(clientKey, validAttempts);

  if (validAttempts.length >= maxAttempts) {

    return res.status(429).json({
      ok: false,
      error: 'Too many login attempts. Please try again in 15 minutes.'
    });
  }

  next();
};

// Record failed login attempt
export const recordFailedLogin = (req, res, next) => {
  const clientKey = req.ip;
  
  if (!loginAttempts.has(clientKey)) {
    loginAttempts.set(clientKey, []);
  }
  
  const attempts = loginAttempts.get(clientKey);
  attempts.push(Date.now());
  loginAttempts.set(clientKey, attempts);
  
  next();
};

// Clear login attempts on successful login
export const clearLoginAttempts = (req, res, next) => {
  const clientKey = req.ip;
  loginAttempts.delete(clientKey);
  next();
};

// Middleware to check if user has required role
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication required' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {

      return res.status(403).json({ 
        ok: false, 
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
      });
    }

    next();
  };
};

// Middleware to optionally authenticate (for routes that work with or without auth)
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length > 0 && result.rows[0].active) {
      req.user = result.rows[0];
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }

  next();
};