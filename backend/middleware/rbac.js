import auditService from '../services/audit.service.js';

// Define permission matrix - controls what each role can access
const permissions = {
  admin: ['*'], // Admin has access to everything
  provider: [
    'patients:read',
    'patients:write', 
    'patients:create',
    'visits:read',
    'visits:write',
    'visits:create',
    'orders:read',
    'orders:write',
    'orders:create',
    'vitals:read',
    'vitals:write',
    'medications:read',
    'medications:write',
    'allergies:read',
    'allergies:write',
    'medical_history:read',
    'medical_history:write',
    'diagnoses:read',
    'diagnoses:write',
    'ros:read',
    'ros:write',
    'physical_exam:read',
    'physical_exam:write',
    'treatment_plans:read',
    'treatment_plans:write',
    'users:read' // Can view other users but not modify
  ],
  nurse: [
    'patients:read',
    'patients:write', // Limited patient info updates
    'visits:read',
    'visits:write', // Can update visit notes
    'vitals:read',
    'vitals:write',
    'vitals:create',
    'medications:read',
    'medications:write', // Can administer medications
    'allergies:read',
    'orders:read',
    'users:read'
  ],
  receptionist: [
    'patients:read',
    'patients:write', // Can update contact info, insurance
    'patients:create', // Can register new patients
    'appointments:read',
    'appointments:write',
    'appointments:create',
    'appointments:delete',
    'visits:read',
    'visits:create', // Can create new visits/check-ins
    'users:read'
  ]
};

// Special admin-only permissions that require explicit admin check
const adminOnlyPermissions = [
  'users:write',
  'users:create',
  'users:delete',
  'patients:delete',
  'appointments:delete',
  'audit:read',
  'system:manage',
  'roles:manage'
];

/**
 * Check if a role has a specific permission
 * @param {string} role - User role
 * @param {string} permission - Required permission (e.g., 'patients:read')
 * @returns {boolean} - Whether the role has permission
 */
export const hasPermission = (role, permission) => {
  if (!role || !permission) {
    return false;
  }

  const rolePermissions = permissions[role];
  if (!rolePermissions) {
    return false;
  }

  // Admin wildcard - has access to everything
  if (rolePermissions.includes('*')) {
    return true;
  }

  // Check for exact permission match
  if (rolePermissions.includes(permission)) {
    return true;
  }

  // Check for resource-level wildcard (e.g., 'patients:*' allows 'patients:read')
  const [resource] = permission.split(':');
  if (rolePermissions.includes(`${resource}:*`)) {
    return true;
  }

  return false;
};

/**
 * Middleware to check if user has required permission
 * @param {string} requiredPermission - Permission required to access resource
 * @returns {Function} - Express middleware function
 */
export const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        await auditService.logRequestAudit({
          userId: null,
          action: 'ACCESS_DENIED',
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          success: false,
          errorMessage: 'No authenticated user found'
        });

        return res.status(401).json({
          ok: false,
          error: 'Authentication required'
        });
      }

      const { role, id: userId } = req.user;

      // Check if permission is admin-only
      if (adminOnlyPermissions.includes(requiredPermission)) {
        if (role !== 'admin') {
          await auditService.logRequestAudit({
            userId,
            action: 'ACCESS_DENIED',
            endpoint: req.originalUrl,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            success: false,
            errorMessage: `Admin-only permission required: ${requiredPermission}. User role: ${role}`
          });

          return res.status(403).json({
            ok: false,
            error: 'Admin access required'
          });
        }
      }

      // Check if user has the required permission
      if (!hasPermission(role, requiredPermission)) {
        await auditService.logRequestAudit({
          userId,
          action: 'ACCESS_DENIED',
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          success: false,
          errorMessage: `Insufficient permissions. Required: ${requiredPermission}, User role: ${role}`
        });

        return res.status(403).json({
          ok: false,
          error: `Access denied. Required permission: ${requiredPermission}`
        });
      }

      // Log successful authorization
      await auditService.logRequestAudit({
        userId,
        action: 'ACCESS_GRANTED',
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: true,
        additionalData: {
          requiredPermission,
          userRole: role
        }
      });

      next();
    } catch (error) {
      console.error('RBAC permission check error:', error);

      await auditService.logRequestAudit({
        userId: req.user?.id || null,
        action: 'ACCESS_DENIED',
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        errorMessage: 'RBAC system error: ' + error.message
      });

      return res.status(500).json({
        ok: false,
        error: 'Authorization system error'
      });
    }
  };
};

/**
 * Middleware to require admin role
 * @returns {Function} - Express middleware function
 */
export const requireAdmin = () => {
  return checkPermission('system:manage');
};

/**
 * Middleware to require specific role (exact match)
 * @param {...string} allowedRoles - Allowed user roles
 * @returns {Function} - Express middleware function
 */
export const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        await auditService.logRequestAudit({
          userId: null,
          action: 'ACCESS_DENIED',
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          success: false,
          errorMessage: 'No authenticated user found'
        });

        return res.status(401).json({
          ok: false,
          error: 'Authentication required'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        await auditService.logRequestAudit({
          userId: req.user.id,
          action: 'ACCESS_DENIED',
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          success: false,
          errorMessage: `Insufficient role. Required: ${allowedRoles.join(' or ')}, User has: ${req.user.role}`
        });

        return res.status(403).json({
          ok: false,
          error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
        });
      }

      await auditService.logRequestAudit({
        userId: req.user.id,
        action: 'ACCESS_GRANTED',
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: true,
        additionalData: {
          allowedRoles,
          userRole: req.user.role
        }
      });

      next();
    } catch (error) {
      console.error('Role check error:', error);

      await auditService.logRequestAudit({
        userId: req.user?.id || null,
        action: 'ACCESS_DENIED',
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        errorMessage: 'Role check system error: ' + error.message
      });

      return res.status(500).json({
        ok: false,
        error: 'Authorization system error'
      });
    }
  };
};

/**
 * Get all permissions for a specific role
 * @param {string} role - User role
 * @returns {string[]} - Array of permissions
 */
export const getRolePermissions = (role) => {
  return permissions[role] || [];
};

/**
 * Get all available permissions in the system
 * @returns {Object} - Permission matrix object
 */
export const getAllPermissions = () => {
  return { ...permissions };
};

/**
 * Check if a specific permission exists in the system
 * @param {string} permission - Permission to check
 * @returns {boolean} - Whether permission exists
 */
export const permissionExists = (permission) => {
  if (adminOnlyPermissions.includes(permission)) {
    return true;
  }

  for (const rolePerms of Object.values(permissions)) {
    if (rolePerms.includes(permission) || rolePerms.includes('*')) {
      return true;
    }
  }

  return false;
};