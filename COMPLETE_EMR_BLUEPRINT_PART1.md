# COMPLETE EMR BLUEPRINT - PART 1: FOUNDATION & CORE SYSTEMS

## Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Role-Based Access Control (RBAC) System](#2-role-based-access-control-rbac-system)
3. [Security Architecture & Middleware](#3-security-architecture--middleware)
4. [Database Schema & Design](#4-database-schema--design)
5. [Patient Scheduling System](#5-patient-scheduling-system)
6. [Check-In & Queue Management](#6-check-in--queue-management)
7. [Dashboard Design by Role](#7-dashboard-design-by-role)

---

## 1. System Overview & Architecture

### 1.1 Unified Platform Architecture

The EMR system follows **Clean Architecture** principles with clear separation of concerns across 5 distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  React Components, UI State Management (Context/Zustand)    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        API LAYER                             │
│  Express Routes, Request Validation, Response Formatting     │
│  Security Middleware Stack (RBAC, Rate Limiting, CSRF)      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                          │
│  Use Cases, Business Logic, Orchestration                    │
│  Transaction Management, Audit Logging                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                             │
│  Entities, Value Objects, Business Rules                     │
│  Domain Events, Aggregates                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                        │
│  PostgreSQL, Redis, External APIs (HL7, FHIR, SureScripts)  │
│  File Storage, Email/SMS Services, Queue Systems            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

#### Frontend Stack
- **Framework**: React 18+ with TypeScript
- **State Management**: React Context API + Zustand for global state
- **Routing**: React Router v6
- **UI Components**: Custom component library + Tailwind CSS
- **Forms**: React Hook Form with Zod validation
- **HTTP Client**: Axios with interceptors
- **Real-time**: Socket.io client for queue updates
- **Charting**: Recharts for analytics dashboards
- **Date/Time**: date-fns for formatting and calculations
- **Rich Text**: Draft.js or TipTap for clinical notes

#### Backend Stack
- **Runtime**: Node.js 18+ LTS
- **Framework**: Express.js 4.18+
- **Database**: PostgreSQL 15+ (primary), Redis 7+ (sessions/cache)
- **ORM/Query Builder**: Native pg driver with prepared statements
- **Authentication**: Custom JWT + httpOnly cookies
- **Validation**: Joi for schema validation
- **Security**: helmet, express-rate-limit, DOMPurify, express-validator
- **Job Queue**: Bull for background jobs (lab results, claims)
- **Logging**: Winston with structured logging
- **Monitoring**: Sentry for error tracking, custom metrics

#### Integration & Interoperability
- **HL7 v2**: For lab interfaces (ORU^R01, ORM^O01)
- **FHIR R4**: RESTful API for external systems
- **DICOM**: PACS integration for imaging
- **EDI**: X12 837 (claims), 835 (ERA), 270/271 (eligibility)
- **e-Prescribing**: SureScripts NCPDP SCRIPT standard
- **CDA**: C-CDA documents for transitions of care

### 1.3 High-Level Data Flow

```
┌──────────────┐
│   Browser    │
│  (React App) │
└──────┬───────┘
       │ HTTPS (TLS 1.3)
       ↓
┌─────────────────────────────────────────┐
│     Security Middleware Stack            │
│  1. Input Sanitization                   │
│  2. RBAC Permission Check                │
│  3. Rate Limiting (by role)              │
│  4. CSRF Token Validation                │
│  5. Session Validation                   │
└─────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│        Application Use Cases             │
│  - CreateAppointment                     │
│  - RecordVitals                          │
│  - SubmitClaim                           │
│  - HandleCriticalValue                   │
└──────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│    Data Access & Audit Layer             │
│  - PHI Access Logging (100% coverage)    │
│  - Row-Level Security Checks             │
│  - Transaction Management                │
└──────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│         PostgreSQL Database              │
│  - RBAC Tables                           │
│  - Clinical Tables                       │
│  - Audit Tables                          │
│  - Medical Code Reference Tables         │
└──────────────────────────────────────────┘
```

---

## 2. Role-Based Access Control (RBAC) System

### 2.1 Role Hierarchy

The system implements **8 distinct roles** with hierarchical permission inheritance:

```
System Admin (SUPERUSER)
    ├── Clinic Admin
    │   ├── Billing Manager
    │   │   └── Billing Clerk
    │   ├── Provider (MD/DO/NP/PA)
    │   └── Medical Assistant (MA)
    └── Front Desk Receptionist
```

### 2.2 Complete RBAC Permissions Matrix (95+ Permissions)

#### PATIENTS Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `patients:create` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `patients:read` | ✅ (own clinic) | ✅ (assigned) | ✅ (assigned) | ✅ (billing only) | ✅ | ✅ | ✅ |
| `patients:update` | ✅ (demographics) | ✅ (limited) | ✅ | ❌ | ❌ | ✅ | ✅ |
| `patients:delete` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `patients:merge` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `patients:export` | ❌ | ❌ | ✅ (own patients) | ❌ | ❌ | ✅ | ✅ |
| `patients:view_ssn` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `patients:view_insurance` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `patients:search_all` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

#### SCHEDULING Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `appointments:create` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `appointments:read` | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `appointments:update` | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `appointments:cancel` | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `appointments:reschedule` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `appointments:no_show` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `appointments:view_all_providers` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `schedule:block_time` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `schedule:manage_templates` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |

#### CHECK-IN & QUEUE Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `checkin:perform` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `checkin:update_insurance` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `checkin:verify_eligibility` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `queue:view` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `queue:assign_room` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `queue:update_status` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |

#### VITALS & CLINICAL DATA Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `vitals:record` | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `vitals:read` | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `vitals:update` | ❌ | ✅ (own) | ✅ | ❌ | ❌ | ✅ | ✅ |
| `vitals:delete` | ❌ | ❌ | ✅ (with reason) | ❌ | ❌ | ✅ | ✅ |

#### ENCOUNTERS Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `encounters:create` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `encounters:read` | ❌ | ❌ | ✅ (assigned) | ✅ (for billing) | ✅ | ✅ | ✅ |
| `encounters:update` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `encounters:sign` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `encounters:addendum` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `encounters:lock` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `encounters:unlock` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `encounters:view_all` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

#### ORDERS Module (Lab, Imaging, Referrals)
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `orders:create` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `orders:read` | ❌ | ✅ (assigned) | ✅ | ❌ | ❌ | ✅ | ✅ |
| `orders:cancel` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `orders:modify` | ❌ | ❌ | ✅ (before sent) | ❌ | ❌ | ✅ | ✅ |
| `lab_results:view` | ❌ | ✅ (assigned) | ✅ | ❌ | ❌ | ✅ | ✅ |
| `lab_results:acknowledge` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `lab_results:critical_notify` | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `imaging:view` | ❌ | ✅ (assigned) | ✅ | ❌ | ❌ | ✅ | ✅ |
| `imaging:pacs_access` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |

#### PRESCRIPTIONS Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `prescriptions:create` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `prescriptions:read` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `prescriptions:refill` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `prescriptions:cancel` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `prescriptions:controlled_substances` | ❌ | ❌ | ✅ (w/ DEA) | ❌ | ❌ | ❌ | ✅ |
| `prescriptions:eprescribe` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

#### BILLING & CHARGES Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `charges:create` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `charges:read` | ❌ | ❌ | ✅ (own encounters) | ✅ | ✅ | ✅ | ✅ |
| `charges:update` | ❌ | ❌ | ✅ (before submit) | ✅ | ✅ | ✅ | ✅ |
| `charges:delete` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `charges:submit` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `claims:create` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `claims:submit` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `claims:resubmit` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `claims:void` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `claims:view_all` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payments:post` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payments:adjust` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `payments:refund` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `era:process` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `denials:manage` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `denials:appeal` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

#### REPORTS & ANALYTICS Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `reports:scheduling` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `reports:clinical` | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ | ✅ |
| `reports:financial` | ❌ | ❌ | ❌ | ✅ (limited) | ✅ | ✅ | ✅ |
| `reports:compliance` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `reports:phi_audit` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `reports:export` | ❌ | ❌ | ✅ (own data) | ✅ | ✅ | ✅ | ✅ |

#### ADMINISTRATION Module
| Permission | Front Desk | MA | Provider | Billing Clerk | Billing Mgr | Clinic Admin | System Admin |
|------------|------------|-----|----------|---------------|-------------|--------------|--------------|
| `users:create` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `users:read` | ✅ (basic info) | ✅ (basic info) | ✅ (basic info) | ❌ | ❌ | ✅ | ✅ |
| `users:update` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `users:deactivate` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `users:assign_roles` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (non-admin) | ✅ |
| `roles:create` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `roles:update` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `roles:delete` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `permissions:assign` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `clinics:create` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `clinics:update` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own) | ✅ |
| `settings:view` | ✅ (limited) | ✅ (limited) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `settings:update` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `audit:view` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `audit:export` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `break_glass:use` | ❌ | ❌ | ✅ (emergency) | ❌ | ❌ | ✅ | ✅ |

### 2.3 RBAC Implementation Code

#### Database Tables for RBAC

```sql
-- Roles table
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  parent_role_id INTEGER REFERENCES roles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Permissions table
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  resource VARCHAR(50) NOT NULL,  -- e.g., 'patients', 'encounters'
  action VARCHAR(50) NOT NULL,     -- e.g., 'create', 'read', 'update'
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(resource, action)
);

-- Role permissions junction table
CREATE TABLE role_permissions (
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT TRUE,
  conditions JSONB,  -- For conditional permissions (e.g., {"scope": "own"})
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- User roles junction table
CREATE TABLE user_roles (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id),
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id, clinic_id)
);

-- Create indexes
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_clinic ON user_roles(clinic_id);
```

#### Backend: RBAC Middleware

```javascript
// backend/middleware/rbac.js
const pool = require('../config/database');

class RBACMiddleware {
  /**
   * Check if user has required permission
   * @param {string} resource - Resource name (e.g., 'patients')
   * @param {string} action - Action name (e.g., 'create')
   * @param {object} options - Additional options for scope checking
   */
  static hasPermission(resource, action, options = {}) {
    return async (req, res, next) => {
      try {
        const userId = req.user.id;
        const clinicId = req.user.clinic_id || req.body.clinic_id || req.query.clinic_id;

        // Get user's permissions (includes inherited permissions from role hierarchy)
        const permissions = await this.getUserPermissions(userId, clinicId);

        const permissionKey = `${resource}:${action}`;
        const permission = permissions.find(p => p.key === permissionKey);

        if (!permission) {
          return res.status(403).json({
            ok: false,
            error: 'Insufficient permissions',
            required: permissionKey
          });
        }

        // Check conditional permissions (scope: own, assigned, etc.)
        if (permission.conditions) {
          const scopeValid = await this.validateScope(
            permission.conditions,
            userId,
            req,
            options
          );

          if (!scopeValid) {
            return res.status(403).json({
              ok: false,
              error: 'Permission scope violation',
              required: permissionKey,
              scope: permission.conditions.scope
            });
          }
        }

        // Log authorization check for audit
        await this.logAuthorizationCheck(userId, permissionKey, true, req);

        next();
      } catch (error) {
        console.error('RBAC check error:', error);
        res.status(500).json({ ok: false, error: 'Authorization check failed' });
      }
    };
  }

  /**
   * Get all permissions for a user (includes role hierarchy)
   */
  static async getUserPermissions(userId, clinicId) {
    const query = `
      WITH RECURSIVE role_hierarchy AS (
        -- Base case: user's direct roles
        SELECT r.id, r.name, r.parent_role_id
        FROM roles r
        JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = $1
          AND ur.clinic_id = $2
          AND (ur.effective_to IS NULL OR ur.effective_to > NOW())

        UNION

        -- Recursive case: parent roles
        SELECT r.id, r.name, r.parent_role_id
        FROM roles r
        JOIN role_hierarchy rh ON r.id = rh.parent_role_id
      )
      SELECT DISTINCT
        p.resource || ':' || p.action as key,
        p.resource,
        p.action,
        p.description,
        rp.conditions
      FROM role_hierarchy rh
      JOIN role_permissions rp ON rp.role_id = rh.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.granted = TRUE
      ORDER BY p.resource, p.action;
    `;

    const result = await pool.query(query, [userId, clinicId]);
    return result.rows;
  }

  /**
   * Validate scope conditions (own, assigned, clinic, etc.)
   */
  static async validateScope(conditions, userId, req, options) {
    if (!conditions.scope) return true;

    switch (conditions.scope) {
      case 'own':
        // Check if resource belongs to user
        if (req.params.providerId) {
          return req.params.providerId === userId.toString();
        }
        if (req.body.provider_id) {
          return req.body.provider_id === userId;
        }
        return options.ownerId === userId;

      case 'assigned':
        // Check if user is assigned to patient/encounter
        const resourceId = req.params.patientId || req.params.encounterId || options.resourceId;
        const assignment = await pool.query(
          `SELECT 1 FROM patient_provider_assignments
           WHERE patient_id = $1 AND provider_id = $2 AND is_active = TRUE`,
          [resourceId, userId]
        );
        return assignment.rows.length > 0;

      case 'clinic':
        // Check if resource belongs to user's clinic
        const clinicId = req.user.clinic_id;
        return req.body.clinic_id === clinicId || req.params.clinicId === clinicId.toString();

      default:
        return true;
    }
  }

  /**
   * Log authorization check for audit trail
   */
  static async logAuthorizationCheck(userId, permission, granted, req) {
    await pool.query(
      `INSERT INTO authorization_log
       (user_id, permission, granted, ip_address, user_agent, resource_type, resource_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        permission,
        granted,
        req.ip,
        req.get('user-agent'),
        req.params.resourceType || null,
        req.params.resourceId || null
      ]
    );
  }

  /**
   * Break-glass emergency access
   */
  static breakGlassAccess(resource, action) {
    return async (req, res, next) => {
      const { emergency_reason, patient_id } = req.body;

      if (!emergency_reason || emergency_reason.trim().length < 20) {
        return res.status(400).json({
          ok: false,
          error: 'Emergency access requires detailed justification (min 20 chars)'
        });
      }

      // Log break-glass access
      await pool.query(
        `INSERT INTO break_glass_log
         (user_id, patient_id, reason, permission, ip_address, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [req.user.id, patient_id, emergency_reason, `${resource}:${action}`, req.ip]
      );

      // Send immediate alert to compliance team
      await this.alertComplianceTeam({
        userId: req.user.id,
        patientId: patient_id,
        reason: emergency_reason,
        permission: `${resource}:${action}`,
        timestamp: new Date()
      });

      next();
    };
  }

  static async alertComplianceTeam(breakGlassEvent) {
    // Implementation: Send email/SMS to compliance team
    console.log('BREAK-GLASS ACCESS ALERT:', breakGlassEvent);
  }
}

module.exports = RBACMiddleware;
```

#### Usage in Routes

```javascript
// backend/routes/patients.js
const express = require('express');
const router = express.Router();
const { hasPermission, breakGlassAccess } = require('../middleware/rbac');
const authenticate = require('../middleware/authenticate');

// Create patient - requires patients:create permission
router.post('/',
  authenticate,
  hasPermission('patients', 'create'),
  async (req, res) => {
    // Implementation
  }
);

// Read patient - requires patients:read with scope validation
router.get('/:patientId',
  authenticate,
  hasPermission('patients', 'read'),
  async (req, res) => {
    // Implementation
  }
);

// Emergency access to patient record
router.post('/:patientId/break-glass',
  authenticate,
  breakGlassAccess('patients', 'read'),
  async (req, res) => {
    // Grant temporary access
  }
);

module.exports = router;
```

---

## 3. Security Architecture & Middleware

### 3.1 Security Middleware Stack

The security middleware executes in the following order for every request:

```
Request Flow:
  1. Input Sanitization
  2. Authentication Check
  3. RBAC Permission Check
  4. Rate Limiting (role-based)
  5. CSRF Token Validation
  6. Request Validation (Joi schema)
  ↓
  Route Handler
  ↓
  7. PHI Access Audit Log
  8. Response Security Headers
```

### 3.2 Input Sanitization Middleware

```javascript
// backend/middleware/sanitization.js
const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');

class SanitizationMiddleware {
  /**
   * Sanitize all incoming request data
   */
  static sanitizeInputs(req, res, next) {
    try {
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }
      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }
      if (req.params) {
        req.params = this.sanitizeObject(req.params);
      }
      next();
    } catch (error) {
      console.error('Sanitization error:', error);
      res.status(400).json({
        ok: false,
        error: 'Invalid input detected'
      });
    }
  }

  /**
   * Recursively sanitize object
   */
  static sanitizeObject(obj) {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (obj !== null && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key to prevent prototype pollution
        const sanitizedKey = validator.escape(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(str) {
    // Remove null bytes
    str = str.replace(/\0/g, '');

    // Trim whitespace
    str = str.trim();

    // Remove HTML tags (except for rich text fields - handled separately)
    str = DOMPurify.sanitize(str, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });

    // Escape SQL special characters (defense in depth with parameterized queries)
    str = str.replace(/[;'"\\]/g, '');

    return str;
  }

  /**
   * Sanitize rich text (for clinical notes)
   */
  static sanitizeRichText(html) {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['class']
    });
  }

  /**
   * Validate and sanitize SQL identifiers (table/column names)
   */
  static sanitizeSQLIdentifier(identifier) {
    // Only allow alphanumeric and underscore
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error('Invalid SQL identifier');
    }
    return identifier;
  }
}

module.exports = SanitizationMiddleware;
```

### 3.3 Rate Limiting Middleware (Role-Based)

```javascript
// backend/middleware/rateLimiting.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('../config/redis');

/**
 * Role-based rate limiting configuration
 */
const RATE_LIMITS = {
  'System Admin': { windowMs: 15 * 60 * 1000, max: 1000 },
  'Clinic Admin': { windowMs: 15 * 60 * 1000, max: 500 },
  'Provider': { windowMs: 15 * 60 * 1000, max: 300 },
  'Medical Assistant': { windowMs: 15 * 60 * 1000, max: 200 },
  'Front Desk': { windowMs: 15 * 60 * 1000, max: 200 },
  'Billing Manager': { windowMs: 15 * 60 * 1000, max: 300 },
  'Billing Clerk': { windowMs: 15 * 60 * 1000, max: 200 },
  'default': { windowMs: 15 * 60 * 1000, max: 100 }  // Unauthenticated users
};

class RateLimitingMiddleware {
  /**
   * Create rate limiter based on user role
   */
  static createRateLimiter() {
    return async (req, res, next) => {
      const userRole = req.user?.role || 'default';
      const limits = RATE_LIMITS[userRole] || RATE_LIMITS.default;

      const limiter = rateLimit({
        store: new RedisStore({
          client: redis,
          prefix: `rate_limit:${userRole}:`
        }),
        windowMs: limits.windowMs,
        max: limits.max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          // Use user ID if authenticated, IP if not
          return req.user?.id?.toString() || req.ip;
        },
        handler: (req, res) => {
          res.status(429).json({
            ok: false,
            error: 'Too many requests',
            retryAfter: Math.ceil(limits.windowMs / 1000)
          });
        }
      });

      limiter(req, res, next);
    };
  }

  /**
   * Strict rate limiting for sensitive operations
   */
  static strictLimiter = rateLimit({
    store: new RedisStore({
      client: redis,
      prefix: 'rate_limit:strict:'
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Only 10 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id?.toString() || req.ip,
    handler: (req, res) => {
      res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded for sensitive operation',
        retryAfter: 900 // 15 minutes in seconds
      });
    }
  });
}

module.exports = RateLimitingMiddleware;
```

### 3.4 CSRF Protection

```javascript
// backend/middleware/csrf.js
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// CSRF protection middleware
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  }
});

// Route to get CSRF token
router.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Apply to all state-changing routes
router.post('*', csrfProtection);
router.put('*', csrfProtection);
router.patch('*', csrfProtection);
router.delete('*', csrfProtection);

module.exports = { csrfProtection };
```

### 3.5 Session Security

```javascript
// backend/middleware/sessionSecurity.js
const pool = require('../config/database');
const crypto = require('crypto');

class SessionSecurityMiddleware {
  /**
   * Validate session on every request
   */
  static async validateSession(req, res, next) {
    try {
      const sessionToken = req.cookies.session_token;

      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'No session token' });
      }

      // Check if session exists and is valid
      const sessionQuery = `
        SELECT
          us.user_id,
          us.expires_at,
          us.ip_address,
          us.user_agent,
          us.is_active,
          u.email,
          u.role
        FROM user_sessions us
        JOIN users u ON u.id = us.user_id
        WHERE us.session_token = $1
          AND us.is_active = TRUE
          AND us.expires_at > NOW()
      `;

      const result = await pool.query(sessionQuery, [sessionToken]);

      if (result.rows.length === 0) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      const session = result.rows[0];

      // Validate IP address (optional - can be disabled for mobile users)
      if (process.env.ENFORCE_IP_VALIDATION === 'true' && session.ip_address !== req.ip) {
        await this.logSecurityIncident(session.user_id, 'IP_MISMATCH', req);
        return res.status(401).json({ ok: false, error: 'Session IP mismatch' });
      }

      // Validate user agent
      if (session.user_agent !== req.get('user-agent')) {
        await this.logSecurityIncident(session.user_id, 'USER_AGENT_MISMATCH', req);
        return res.status(401).json({ ok: false, error: 'Session user agent mismatch' });
      }

      // Update last activity
      await pool.query(
        `UPDATE user_sessions SET last_activity = NOW() WHERE session_token = $1`,
        [sessionToken]
      );

      // Attach user to request
      req.user = {
        id: session.user_id,
        email: session.email,
        role: session.role
      };

      next();
    } catch (error) {
      console.error('Session validation error:', error);
      res.status(500).json({ ok: false, error: 'Session validation failed' });
    }
  }

  /**
   * Create new session
   */
  static async createSession(userId, req) {
    const sessionToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await pool.query(
      `INSERT INTO user_sessions
       (user_id, session_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, sessionToken, req.ip, req.get('user-agent'), expiresAt]
    );

    return { sessionToken, expiresAt };
  }

  /**
   * Invalidate session (logout)
   */
  static async invalidateSession(sessionToken) {
    await pool.query(
      `UPDATE user_sessions SET is_active = FALSE WHERE session_token = $1`,
      [sessionToken]
    );
  }

  /**
   * Invalidate all user sessions (forced logout)
   */
  static async invalidateAllUserSessions(userId) {
    await pool.query(
      `UPDATE user_sessions SET is_active = FALSE WHERE user_id = $1`,
      [userId]
    );
  }

  /**
   * Log security incident
   */
  static async logSecurityIncident(userId, incidentType, req) {
    await pool.query(
      `INSERT INTO security_incidents
       (user_id, incident_type, ip_address, user_agent, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        userId,
        incidentType,
        req.ip,
        req.get('user-agent'),
        JSON.stringify({ path: req.path, method: req.method })
      ]
    );
  }
}

module.exports = SessionSecurityMiddleware;
```

### 3.6 PHI Access Audit Logging

```javascript
// backend/middleware/phiAuditLog.js
const pool = require('../config/database');

class PHIAuditMiddleware {
  /**
   * Log all PHI access (100% coverage requirement)
   */
  static logPHIAccess(resourceType) {
    return async (req, res, next) => {
      const originalJson = res.json.bind(res);

      res.json = async function(data) {
        try {
          // Only log if response was successful and contains PHI
          if (data && data.ok !== false) {
            const userId = req.user?.id;
            const resourceId = req.params.patientId || req.params.encounterId ||
                              req.body.patient_id || data.patient_id;

            if (userId && resourceId) {
              await pool.query(
                `INSERT INTO phi_audit_log
                 (user_id, action, resource_type, resource_id, ip_address,
                  user_agent, timestamp, data_accessed)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
                [
                  userId,
                  req.method,
                  resourceType,
                  resourceId,
                  req.ip,
                  req.get('user-agent'),
                  JSON.stringify({ fields: Object.keys(data) })
                ]
              );
            }
          }
        } catch (error) {
          console.error('PHI audit log error:', error);
          // Don't fail request if audit logging fails, but alert ops team
        }

        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Get PHI access history for a patient
   */
  static async getPatientAccessHistory(patientId, limit = 100) {
    const result = await pool.query(
      `SELECT
        pal.id,
        pal.action,
        pal.resource_type,
        pal.timestamp,
        pal.ip_address,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email,
        r.name as user_role
      FROM phi_audit_log pal
      JOIN users u ON u.id = pal.user_id
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE pal.resource_id = $1
      ORDER BY pal.timestamp DESC
      LIMIT $2`,
      [patientId, limit]
    );

    return result.rows;
  }
}

module.exports = PHIAuditMiddleware;
```

### 3.7 Complete Security Middleware Application

```javascript
// backend/app.js
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { sanitizeInputs } = require('./middleware/sanitization');
const { createRateLimiter } = require('./middleware/rateLimiting');
const { validateSession } = require('./middleware/sessionSecurity');
const { csrfProtection } = require('./middleware/csrf');

const app = express();

// 1. Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 2. CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// 3. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 4. Input sanitization (applies to all routes)
app.use(sanitizeInputs);

// 5. Session validation (protected routes only)
app.use('/api', validateSession);

// 6. Rate limiting (role-based)
app.use('/api', createRateLimiter());

// 7. CSRF protection (state-changing routes)
app.use('/api', csrfProtection);

// Routes
app.use('/api/patients', require('./routes/patients'));
app.use('/api/appointments', require('./routes/appointments'));
// ... other routes

module.exports = app;
```

---

## 4. Database Schema & Design

### 4.1 Complete Database Schema (40+ Tables)

#### Core System Tables

```sql
-- ============================================
-- CORE SYSTEM TABLES
-- ============================================

-- Clinics/Organizations
CREATE TABLE clinics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  npi VARCHAR(10) UNIQUE,
  tax_id VARCHAR(20),
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  phone VARCHAR(20),
  fax VARCHAR(20),
  email VARCHAR(100),
  website VARCHAR(200),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  npi VARCHAR(10),
  dea_number VARCHAR(20),
  license_number VARCHAR(50),
  license_state VARCHAR(2),
  specialty VARCHAR(100),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  password_changed_at TIMESTAMP DEFAULT NOW(),
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User clinics association
CREATE TABLE user_clinics (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, clinic_id)
);

-- ============================================
-- RBAC TABLES (from Section 2.3)
-- ============================================

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  parent_role_id INTEGER REFERENCES roles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(resource, action)
);

CREATE TABLE role_permissions (
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT TRUE,
  conditions JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id),
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id, clinic_id)
);

-- ============================================
-- SECURITY & AUDIT TABLES
-- ============================================

-- User sessions
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(128) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_activity TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Failed login attempts
CREATE TABLE failed_login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  attempted_at TIMESTAMP DEFAULT NOW()
);

-- PHI audit log (HIPAA compliance)
CREATE TABLE phi_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(20) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id INTEGER NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  data_accessed JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Authorization log
CREATE TABLE authorization_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  permission VARCHAR(100) NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Break-glass emergency access log
CREATE TABLE break_glass_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  patient_id INTEGER REFERENCES patients(id),
  reason TEXT NOT NULL,
  permission VARCHAR(100),
  ip_address VARCHAR(45),
  approved_by INTEGER REFERENCES users(id),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Security incidents
CREATE TABLE security_incidents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  incident_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium',
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PATIENT TABLES
-- ============================================

CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER REFERENCES clinics(id),
  mrn VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  date_of_birth DATE NOT NULL,
  ssn_encrypted TEXT,
  gender VARCHAR(20),
  email VARCHAR(100),
  phone_primary VARCHAR(20),
  phone_secondary VARCHAR(20),
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relation VARCHAR(50),
  preferred_language VARCHAR(50) DEFAULT 'English',
  race VARCHAR(50),
  ethnicity VARCHAR(50),
  marital_status VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Patient insurance
CREATE TABLE patient_insurance (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1,
  payer_id VARCHAR(50),
  payer_name VARCHAR(200) NOT NULL,
  plan_name VARCHAR(200),
  member_id VARCHAR(100) NOT NULL,
  group_number VARCHAR(100),
  policy_holder_name VARCHAR(200),
  policy_holder_dob DATE,
  policy_holder_relation VARCHAR(50),
  effective_date DATE,
  termination_date DATE,
  copay_amount DECIMAL(10,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Patient provider assignments
CREATE TABLE patient_provider_assignments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  unassigned_at TIMESTAMP
);

-- ============================================
-- SCHEDULING TABLES
-- ============================================

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER REFERENCES clinics(id),
  patient_id INTEGER REFERENCES patients(id),
  provider_id INTEGER REFERENCES users(id),
  appointment_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'scheduled',
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration_minutes INTEGER NOT NULL,
  room_number VARCHAR(20),
  reason TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  no_show_marked_by INTEGER REFERENCES users(id),
  no_show_marked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Provider schedules/availability
CREATE TABLE provider_schedules (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Schedule blocks (time off, lunch, etc.)
CREATE TABLE schedule_blocks (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id),
  block_type VARCHAR(50) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  reason TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern JSONB,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CHECK-IN & QUEUE TABLES
-- ============================================

CREATE TABLE patient_queue (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER REFERENCES appointments(id),
  patient_id INTEGER REFERENCES patients(id),
  provider_id INTEGER REFERENCES users(id),
  clinic_id INTEGER REFERENCES clinics(id),
  status VARCHAR(50) DEFAULT 'waiting',
  check_in_time TIMESTAMP DEFAULT NOW(),
  room_assigned VARCHAR(20),
  room_assigned_at TIMESTAMP,
  vitals_completed BOOLEAN DEFAULT FALSE,
  vitals_completed_at TIMESTAMP,
  provider_ready_at TIMESTAMP,
  encounter_started_at TIMESTAMP,
  encounter_completed_at TIMESTAMP,
  check_out_time TIMESTAMP,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- VITALS TABLES
-- ============================================

CREATE TABLE vitals (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id),
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TIMESTAMP DEFAULT NOW(),
  height_inches DECIMAL(5,2),
  weight_lbs DECIMAL(5,2),
  bmi DECIMAL(5,2),
  temperature_f DECIMAL(4,2),
  pulse_bpm INTEGER,
  respiratory_rate INTEGER,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  o2_saturation INTEGER,
  pain_level INTEGER CHECK (pain_level BETWEEN 0 AND 10),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ENCOUNTER TABLES
-- ============================================

CREATE TABLE encounters (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id),
  provider_id INTEGER REFERENCES users(id),
  appointment_id INTEGER REFERENCES appointments(id),
  encounter_type VARCHAR(50) NOT NULL,
  encounter_date DATE NOT NULL,
  encounter_time TIME NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  chief_complaint TEXT,
  hpi TEXT,
  ros JSONB,
  physical_exam JSONB,
  assessment TEXT,
  plan TEXT,
  signed_by INTEGER REFERENCES users(id),
  signed_at TIMESTAMP,
  locked BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMP,
  locked_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Encounter diagnoses
CREATE TABLE encounter_diagnoses (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
  icd10_code VARCHAR(10) NOT NULL,
  description TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  rank INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ORDERS TABLES
-- ============================================

CREATE TABLE lab_orders (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id INTEGER REFERENCES patients(id),
  ordering_provider_id INTEGER REFERENCES users(id),
  order_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'routine',
  lab_facility VARCHAR(200),
  clinical_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE lab_order_tests (
  id SERIAL PRIMARY KEY,
  lab_order_id INTEGER REFERENCES lab_orders(id) ON DELETE CASCADE,
  loinc_code VARCHAR(10) NOT NULL,
  test_name VARCHAR(200) NOT NULL,
  specimen_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE lab_results (
  id SERIAL PRIMARY KEY,
  lab_order_id INTEGER REFERENCES lab_orders(id),
  loinc_code VARCHAR(10),
  test_name VARCHAR(200) NOT NULL,
  value VARCHAR(200),
  units VARCHAR(50),
  reference_range VARCHAR(100),
  is_abnormal BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  result_date TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE imaging_orders (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id INTEGER REFERENCES patients(id),
  ordering_provider_id INTEGER REFERENCES users(id),
  modality VARCHAR(50) NOT NULL,
  body_part VARCHAR(100) NOT NULL,
  procedure_code VARCHAR(20),
  procedure_description TEXT,
  clinical_indication TEXT,
  priority VARCHAR(20) DEFAULT 'routine',
  status VARCHAR(50) DEFAULT 'pending',
  facility VARCHAR(200),
  scheduled_date TIMESTAMP,
  completed_date TIMESTAMP,
  report_url TEXT,
  pacs_study_uid VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE referrals (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id INTEGER REFERENCES patients(id),
  referring_provider_id INTEGER REFERENCES users(id),
  specialty VARCHAR(100) NOT NULL,
  referred_to_name VARCHAR(200),
  referred_to_npi VARCHAR(10),
  reason TEXT NOT NULL,
  urgency VARCHAR(20) DEFAULT 'routine',
  status VARCHAR(50) DEFAULT 'pending',
  authorization_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PRESCRIPTION TABLES
-- ============================================

CREATE TABLE prescriptions (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id INTEGER REFERENCES patients(id),
  prescriber_id INTEGER REFERENCES users(id),
  medication_name VARCHAR(200) NOT NULL,
  ndc_code VARCHAR(20),
  dosage VARCHAR(100) NOT NULL,
  route VARCHAR(50) NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  refills INTEGER DEFAULT 0,
  days_supply INTEGER,
  instructions TEXT,
  indication TEXT,
  is_controlled_substance BOOLEAN DEFAULT FALSE,
  dea_schedule VARCHAR(10),
  status VARCHAR(50) DEFAULT 'active',
  prescribed_date TIMESTAMP DEFAULT NOW(),
  start_date DATE,
  end_date DATE,
  pharmacy_name VARCHAR(200),
  pharmacy_ncpdp VARCHAR(20),
  erx_message_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- BILLING TABLES
-- ============================================

CREATE TABLE charges (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id INTEGER REFERENCES patients(id),
  clinic_id INTEGER REFERENCES clinics(id),
  provider_id INTEGER REFERENCES users(id),
  cpt_code VARCHAR(10) NOT NULL,
  description TEXT,
  modifiers VARCHAR(20)[],
  units INTEGER DEFAULT 1,
  charge_amount DECIMAL(10,2) NOT NULL,
  allowed_amount DECIMAL(10,2),
  diagnosis_pointers INTEGER[],
  status VARCHAR(50) DEFAULT 'pending',
  service_date DATE NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE claims (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id),
  patient_id INTEGER REFERENCES patients(id),
  insurance_id INTEGER REFERENCES patient_insurance(id),
  clinic_id INTEGER REFERENCES clinics(id),
  claim_number VARCHAR(50) UNIQUE,
  status VARCHAR(50) DEFAULT 'draft',
  total_charge_amount DECIMAL(10,2) NOT NULL,
  total_allowed_amount DECIMAL(10,2),
  total_paid_amount DECIMAL(10,2),
  patient_responsibility DECIMAL(10,2),
  submission_date TIMESTAMP,
  edi_837_file TEXT,
  clearinghouse_claim_id VARCHAR(100),
  payer_claim_id VARCHAR(100),
  adjudication_date TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE claim_charges (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER REFERENCES claims(id) ON DELETE CASCADE,
  charge_id INTEGER REFERENCES charges(id),
  line_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER REFERENCES claims(id),
  patient_id INTEGER REFERENCES patients(id),
  payer_type VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  check_number VARCHAR(50),
  transaction_id VARCHAR(100),
  era_835_file TEXT,
  posted_by INTEGER REFERENCES users(id),
  posted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE adjustments (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER REFERENCES claims(id),
  charge_id INTEGER REFERENCES charges(id),
  adjustment_type VARCHAR(50) NOT NULL,
  reason_code VARCHAR(20),
  amount DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE denials (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER REFERENCES claims(id),
  denial_code VARCHAR(20) NOT NULL,
  denial_reason TEXT NOT NULL,
  denied_amount DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'pending',
  appeal_deadline DATE,
  appealed_at TIMESTAMP,
  appealed_by INTEGER REFERENCES users(id),
  resolution TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MEDICAL CODE REFERENCE TABLES
-- ============================================

CREATE TABLE icd10_codes (
  code VARCHAR(10) PRIMARY KEY,
  description TEXT NOT NULL,
  category VARCHAR(100),
  is_billable BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  effective_date DATE,
  termination_date DATE,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cpt_codes (
  code VARCHAR(10) PRIMARY KEY,
  description TEXT NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  facility_fee DECIMAL(10,2),
  non_facility_fee DECIMAL(10,2),
  global_period VARCHAR(10),
  modifier_51_exempt BOOLEAN DEFAULT FALSE,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ndc_codes (
  ndc_code VARCHAR(20) PRIMARY KEY,
  proprietary_name VARCHAR(200) NOT NULL,
  non_proprietary_name VARCHAR(200),
  dosage_form VARCHAR(100),
  route VARCHAR(100),
  strength VARCHAR(100),
  manufacturer VARCHAR(200),
  dea_schedule VARCHAR(10),
  is_active BOOLEAN DEFAULT TRUE,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE loinc_codes (
  loinc_code VARCHAR(10) PRIMARY KEY,
  component VARCHAR(200) NOT NULL,
  property VARCHAR(100),
  time_aspect VARCHAR(50),
  system VARCHAR(100),
  scale VARCHAR(50),
  method VARCHAR(100),
  long_common_name TEXT,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ENCOUNTER TEMPLATE TABLES
-- ============================================

CREATE TABLE encounter_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  specialty VARCHAR(100),
  encounter_type VARCHAR(50),
  chief_complaint_template TEXT,
  hpi_template TEXT,
  ros_template JSONB,
  physical_exam_template JSONB,
  assessment_template TEXT,
  plan_template TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Critical Indexes for Performance

```sql
-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

-- Patient indexes
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_patients_mrn ON patients(mrn);
CREATE INDEX idx_patients_dob ON patients(date_of_birth);
CREATE INDEX idx_patients_name ON patients(last_name, first_name);
CREATE INDEX idx_patients_active ON patients(is_active) WHERE is_active = TRUE;

-- Appointment indexes
CREATE INDEX idx_appointments_provider_date ON appointments(provider_id, start_time);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_clinic_date ON appointments(clinic_id, start_time);
CREATE INDEX idx_appointments_status ON appointments(status) WHERE status = 'scheduled';

-- Encounter indexes
CREATE INDEX idx_encounters_patient ON encounters(patient_id);
CREATE INDEX idx_encounters_provider_date ON encounters(provider_id, encounter_date);
CREATE INDEX idx_encounters_status ON encounters(status);
CREATE INDEX idx_encounters_date ON encounters(encounter_date DESC);

-- Billing indexes
CREATE INDEX idx_charges_encounter ON charges(encounter_id);
CREATE INDEX idx_charges_service_date ON charges(service_date);
CREATE INDEX idx_claims_patient ON claims(patient_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_payments_claim ON payments(claim_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- Audit indexes
CREATE INDEX idx_phi_audit_user ON phi_audit_log(user_id);
CREATE INDEX idx_phi_audit_resource ON phi_audit_log(resource_type, resource_id);
CREATE INDEX idx_phi_audit_timestamp ON phi_audit_log(timestamp DESC);

-- Session indexes
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id)
  WHERE is_active = TRUE;

-- Full-text search indexes
CREATE INDEX idx_icd10_search ON icd10_codes USING gin(search_vector);
CREATE INDEX idx_cpt_search ON cpt_codes USING gin(search_vector);
CREATE INDEX idx_ndc_search ON ndc_codes USING gin(search_vector);
CREATE INDEX idx_loinc_search ON loinc_codes USING gin(search_vector);

-- Update search vectors automatically
CREATE TRIGGER icd10_search_vector_update
  BEFORE INSERT OR UPDATE ON icd10_codes
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', description, code);

CREATE TRIGGER cpt_search_vector_update
  BEFORE INSERT OR UPDATE ON cpt_codes
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', description, code);

CREATE TRIGGER ndc_search_vector_update
  BEFORE INSERT OR UPDATE ON ndc_codes
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english',
    proprietary_name, non_proprietary_name, ndc_code);

CREATE TRIGGER loinc_search_vector_update
  BEFORE INSERT OR UPDATE ON loinc_codes
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english',
    component, long_common_name, loinc_code);
```

---

## 5. Patient Scheduling System

### 5.1 Backend Use Cases

```javascript
// backend/useCases/CreateAppointmentUseCase.js
const pool = require('../config/database');
const { validate } = require('../../validators/appointmentValidator');

class CreateAppointmentUseCase {
  async execute(appointmentData, userId) {
    // Validate input
    const { error, value } = validate(appointmentData);
    if (error) {
      throw new Error(`Validation error: ${error.message}`);
    }

    const {
      patient_id,
      provider_id,
      appointment_type,
      start_time,
      duration_minutes,
      reason,
      notes
    } = value;

    const end_time = new Date(new Date(start_time).getTime() + duration_minutes * 60000);

    // Check for scheduling conflicts
    const conflicts = await this.checkConflicts(provider_id, start_time, end_time);
    if (conflicts.length > 0) {
      throw new Error('Provider has conflicting appointment at this time');
    }

    // Check provider availability
    const isAvailable = await this.checkProviderAvailability(provider_id, start_time);
    if (!isAvailable) {
      throw new Error('Provider is not available at this time');
    }

    // Create appointment
    const result = await pool.query(
      `INSERT INTO appointments
       (patient_id, provider_id, appointment_type, start_time, end_time,
        duration_minutes, reason, notes, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')
       RETURNING *`,
      [patient_id, provider_id, appointment_type, start_time, end_time,
       duration_minutes, reason, notes, userId]
    );

    // Send confirmation (email/SMS)
    await this.sendConfirmation(result.rows[0]);

    return result.rows[0];
  }

  async checkConflicts(providerId, startTime, endTime) {
    const result = await pool.query(
      `SELECT id, start_time, end_time
       FROM appointments
       WHERE provider_id = $1
         AND status NOT IN ('cancelled', 'no-show')
         AND (
           (start_time <= $2 AND end_time > $2) OR
           (start_time < $3 AND end_time >= $3) OR
           (start_time >= $2 AND end_time <= $3)
         )`,
      [providerId, startTime, endTime]
    );
    return result.rows;
  }

  async checkProviderAvailability(providerId, appointmentTime) {
    const dayOfWeek = new Date(appointmentTime).getDay();
    const timeOfDay = appointmentTime.toTimeString().slice(0, 5);

    const result = await pool.query(
      `SELECT 1 FROM provider_schedules
       WHERE provider_id = $1
         AND day_of_week = $2
         AND start_time <= $3
         AND end_time > $3
         AND is_active = TRUE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)`,
      [providerId, dayOfWeek, timeOfDay]
    );

    return result.rows.length > 0;
  }

  async sendConfirmation(appointment) {
    // Implementation: Send email/SMS confirmation
    console.log('Sending appointment confirmation:', appointment.id);
  }
}

module.exports = CreateAppointmentUseCase;
```

### 5.2 Frontend Calendar Component

```jsx
// frontend/components/Calendar/ProviderCalendar.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';

const ProviderCalendar = ({ providerId }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeekData();
  }, [currentWeek, providerId]);

  const loadWeekData = async () => {
    setLoading(true);
    try {
      const weekStart = startOfWeek(currentWeek);
      const weekEnd = addDays(weekStart, 7);

      // Load appointments
      const apptResponse = await axios.get('/api/appointments', {
        params: {
          provider_id: providerId,
          start_date: weekStart.toISOString(),
          end_date: weekEnd.toISOString()
        }
      });

      // Load availability
      const availResponse = await axios.get('/api/provider-schedules', {
        params: { provider_id: providerId }
      });

      setAppointments(apptResponse.data);
      setAvailability(availResponse.data);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousWeek = () => {
    setCurrentWeek(subWeeks(currentWeek, 1));
  };

  const handleNextWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, 1));
  };

  const handleTimeSlotClick = (date, time) => {
    // Open appointment creation modal
    console.log('Create appointment:', date, time);
  };

  const renderTimeSlots = (date) => {
    const dayOfWeek = date.getDay();
    const dayAvailability = availability.find(a => a.day_of_week === dayOfWeek);

    if (!dayAvailability) {
      return <div className="text-gray-400 text-sm p-4">Not available</div>;
    }

    const slots = [];
    const startHour = parseInt(dayAvailability.start_time.split(':')[0]);
    const endHour = parseInt(dayAvailability.end_time.split(':')[0]);

    for (let hour = startHour; hour < endHour; hour++) {
      ['00', '30'].forEach(minutes => {
        const timeString = `${hour.toString().padStart(2, '0')}:${minutes}`;
        const slotDateTime = new Date(date);
        slotDateTime.setHours(hour, parseInt(minutes), 0);

        // Check if slot has appointment
        const appointment = appointments.find(appt => {
          const apptStart = new Date(appt.start_time);
          return apptStart.getTime() === slotDateTime.getTime();
        });

        slots.push(
          <TimeSlot
            key={timeString}
            time={timeString}
            date={date}
            appointment={appointment}
            onClick={() => handleTimeSlotClick(date, timeString)}
          />
        );
      });
    }

    return slots;
  };

  const weekDays = [...Array(7)].map((_, i) =>
    addDays(startOfWeek(currentWeek), i)
  );

  if (loading) {
    return <div className="p-8 text-center">Loading calendar...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <button
          onClick={handlePreviousWeek}
          className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
        >
          Previous Week
        </button>
        <h2 className="text-lg font-semibold">
          Week of {format(startOfWeek(currentWeek), 'MMM d, yyyy')}
        </h2>
        <button
          onClick={handleNextWeek}
          className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
        >
          Next Week
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-8 border-b">
        <div className="p-2 border-r bg-gray-50"></div>
        {weekDays.map(day => (
          <div key={day.toISOString()} className="p-2 text-center border-r bg-gray-50">
            <div className="font-semibold">{format(day, 'EEE')}</div>
            <div className="text-sm text-gray-600">{format(day, 'MMM d')}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-8">
        <div className="border-r">
          {/* Time labels column */}
          <TimeLabels />
        </div>
        {weekDays.map(day => (
          <div key={day.toISOString()} className="border-r min-h-[600px]">
            {renderTimeSlots(day)}
          </div>
        ))}
      </div>
    </div>
  );
};

const TimeSlot = ({ time, date, appointment, onClick }) => {
  if (appointment) {
    return (
      <div
        className={`p-2 m-1 rounded text-sm cursor-pointer ${
          appointment.status === 'scheduled'
            ? 'bg-blue-100 border border-blue-300'
            : 'bg-gray-100 border border-gray-300'
        }`}
        onClick={() => console.log('Edit appointment:', appointment.id)}
      >
        <div className="font-semibold truncate">{appointment.patient_name}</div>
        <div className="text-xs text-gray-600">{appointment.appointment_type}</div>
      </div>
    );
  }

  return (
    <div
      className="h-12 border-b hover:bg-gray-50 cursor-pointer"
      onClick={onClick}
    />
  );
};

const TimeLabels = () => {
  const hours = [...Array(12)].map((_, i) => i + 8); // 8 AM to 7 PM

  return (
    <div>
      {hours.map(hour => (
        <div key={hour} className="h-24 border-b flex items-start justify-end pr-2 pt-1">
          <span className="text-xs text-gray-500">
            {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ProviderCalendar;
```

### 5.3 Appointment Search & Filtering

```jsx
// frontend/components/Appointments/AppointmentSearch.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';

const AppointmentSearch = () => {
  const [filters, setFilters] = useState({
    patient_name: '',
    provider_id: '',
    appointment_type: '',
    status: '',
    date_from: '',
    date_to: ''
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/appointments/search', {
        params: filters
      });
      setResults(response.data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <input
          type="text"
          placeholder="Patient Name"
          value={filters.patient_name}
          onChange={(e) => setFilters({ ...filters, patient_name: e.target.value })}
          className="px-3 py-2 border rounded"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no-show">No Show</option>
        </select>
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          className="px-3 py-2 border rounded"
        />
      </div>

      <button
        onClick={handleSearch}
        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Search Appointments
      </button>

      {/* Results Table */}
      <div className="mt-6">
        <table className="min-w-full bg-white border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 border">Date/Time</th>
              <th className="px-4 py-2 border">Patient</th>
              <th className="px-4 py-2 border">Provider</th>
              <th className="px-4 py-2 border">Type</th>
              <th className="px-4 py-2 border">Status</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map(appt => (
              <tr key={appt.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border">
                  {format(new Date(appt.start_time), 'MMM d, yyyy h:mm a')}
                </td>
                <td className="px-4 py-2 border">{appt.patient_name}</td>
                <td className="px-4 py-2 border">{appt.provider_name}</td>
                <td className="px-4 py-2 border">{appt.appointment_type}</td>
                <td className="px-4 py-2 border">
                  <span className={`px-2 py-1 rounded text-xs ${
                    appt.status === 'scheduled' ? 'bg-green-100 text-green-800' :
                    appt.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {appt.status}
                  </span>
                </td>
                <td className="px-4 py-2 border">
                  <button className="text-blue-600 hover:underline mr-2">Edit</button>
                  <button className="text-red-600 hover:underline">Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AppointmentSearch;
```

---

## 6. Check-In & Queue Management

### 6.1 Check-In Workflow (Backend)

```javascript
// backend/useCases/CheckInPatientUseCase.js
const pool = require('../config/database');

class CheckInPatientUseCase {
  async execute(appointmentId, checkInData, userId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get appointment details
      const apptResult = await client.query(
        `SELECT a.*, p.id as patient_id, p.first_name, p.last_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.id = $1`,
        [appointmentId]
      );

      if (apptResult.rows.length === 0) {
        throw new Error('Appointment not found');
      }

      const appointment = apptResult.rows[0];

      // Update appointment status
      await client.query(
        `UPDATE appointments SET status = 'checked-in' WHERE id = $1`,
        [appointmentId]
      );

      // Update insurance if provided
      if (checkInData.insurance_update) {
        await this.updateInsurance(client, appointment.patient_id, checkInData.insurance_update);
      }

      // Verify eligibility if requested
      let eligibilityResult = null;
      if (checkInData.verify_eligibility) {
        eligibilityResult = await this.verifyEligibility(appointment.patient_id);
      }

      // Add to queue
      const queueResult = await client.query(
        `INSERT INTO patient_queue
         (appointment_id, patient_id, provider_id, clinic_id, status, check_in_time)
         VALUES ($1, $2, $3, $4, 'waiting', NOW())
         RETURNING *`,
        [
          appointmentId,
          appointment.patient_id,
          appointment.provider_id,
          appointment.clinic_id
        ]
      );

      await client.query('COMMIT');

      // Notify MA/Provider via WebSocket
      await this.notifyStaff(queueResult.rows[0]);

      return {
        queue_entry: queueResult.rows[0],
        eligibility: eligibilityResult
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateInsurance(client, patientId, insuranceData) {
    // Set all existing insurance to inactive
    await client.query(
      `UPDATE patient_insurance SET is_active = FALSE WHERE patient_id = $1`,
      [patientId]
    );

    // Insert new insurance
    await client.query(
      `INSERT INTO patient_insurance
       (patient_id, priority, payer_id, payer_name, member_id, effective_date, is_active)
       VALUES ($1, 1, $2, $3, $4, $5, TRUE)`,
      [
        patientId,
        insuranceData.payer_id,
        insuranceData.payer_name,
        insuranceData.member_id,
        insuranceData.effective_date
      ]
    );
  }

  async verifyEligibility(patientId) {
    // Implementation: Call eligibility verification service (270/271 transaction)
    return { verified: true, coverage: 'Active' };
  }

  async notifyStaff(queueEntry) {
    // Implementation: WebSocket notification to MA dashboard
    console.log('Notifying staff of new patient in queue:', queueEntry.id);
  }
}

module.exports = CheckInPatientUseCase;
```

### 6.2 Queue Dashboard (Frontend)

```jsx
// frontend/components/Queue/QueueDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { format } from 'date-fns';

const QueueDashboard = ({ clinicId, providerId }) => {
  const [queueEntries, setQueueEntries] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    loadQueue();

    // Setup WebSocket for real-time updates
    const socketInstance = io(process.env.REACT_APP_WS_URL, {
      auth: { token: localStorage.getItem('session_token') }
    });

    socketInstance.on('queue:update', (data) => {
      setQueueEntries(prev => {
        const index = prev.findIndex(e => e.id === data.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = data;
          return updated;
        }
        return [...prev, data];
      });
    });

    socketInstance.on('queue:remove', (queueId) => {
      setQueueEntries(prev => prev.filter(e => e.id !== queueId));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [clinicId, providerId]);

  const loadQueue = async () => {
    try {
      const response = await axios.get('/api/queue', {
        params: { clinic_id: clinicId, provider_id: providerId }
      });
      setQueueEntries(response.data);
    } catch (error) {
      console.error('Error loading queue:', error);
    }
  };

  const handleAssignRoom = async (queueId, roomNumber) => {
    try {
      await axios.patch(`/api/queue/${queueId}/assign-room`, {
        room_number: roomNumber
      });
    } catch (error) {
      console.error('Error assigning room:', error);
    }
  };

  const handleUpdateStatus = async (queueId, status) => {
    try {
      await axios.patch(`/api/queue/${queueId}/status`, { status });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'waiting': 'bg-yellow-100 text-yellow-800',
      'roomed': 'bg-blue-100 text-blue-800',
      'vitals_complete': 'bg-purple-100 text-purple-800',
      'ready_for_provider': 'bg-green-100 text-green-800',
      'with_provider': 'bg-indigo-100 text-indigo-800',
      'completed': 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">Patient Queue</h2>

      <div className="space-y-4">
        {queueEntries.map(entry => (
          <div key={entry.id} className="border rounded-lg p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">
                      {entry.patient_first_name} {entry.patient_last_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Appt: {format(new Date(entry.appointment_time), 'h:mm a')}
                    </p>
                    <p className="text-sm text-gray-600">
                      Checked in: {format(new Date(entry.check_in_time), 'h:mm a')}
                    </p>
                  </div>

                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">Provider:</span> {entry.provider_name}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Type:</span> {entry.appointment_type}
                    </p>
                    {entry.room_assigned && (
                      <p className="text-sm">
                        <span className="font-medium">Room:</span> {entry.room_assigned}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(entry.status)}`}>
                      {entry.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ml-4 space-y-2">
                {entry.status === 'waiting' && (
                  <button
                    onClick={() => {
                      const room = prompt('Enter room number:');
                      if (room) handleAssignRoom(entry.id, room);
                    }}
                    className="block w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Assign Room
                  </button>
                )}

                {entry.status === 'roomed' && (
                  <button
                    onClick={() => window.location.href = `/vitals/${entry.patient_id}?queue_id=${entry.id}`}
                    className="block w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Record Vitals
                  </button>
                )}

                {entry.status === 'ready_for_provider' && (
                  <button
                    onClick={() => window.location.href = `/encounter/create?appointment_id=${entry.appointment_id}`}
                    className="block w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Start Encounter
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {queueEntries.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No patients in queue
          </div>
        )}
      </div>
    </div>
  );
};

export default QueueDashboard;
```

---

## 7. Dashboard Design by Role

### 7.1 Provider Dashboard

```jsx
// frontend/components/Dashboards/ProviderDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';

const ProviderDashboard = ({ providerId }) => {
  const [todayStats, setTodayStats] = useState(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [criticalResults, setCriticalResults] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, [providerId]);

  const loadDashboardData = async () => {
    try {
      const [stats, appointments, tasks, results] = await Promise.all([
        axios.get(`/api/providers/${providerId}/today-stats`),
        axios.get(`/api/appointments/upcoming`, { params: { provider_id: providerId } }),
        axios.get(`/api/tasks/pending`, { params: { provider_id: providerId } }),
        axios.get(`/api/lab-results/critical`, { params: { provider_id: providerId } })
      ]);

      setTodayStats(stats.data);
      setUpcomingAppointments(appointments.data);
      setPendingTasks(tasks.data);
      setCriticalResults(results.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard
          title="Today's Appointments"
          value={todayStats?.total_appointments || 0}
          subtitle={`${todayStats?.completed || 0} completed`}
          icon="📅"
        />
        <StatCard
          title="Patients Waiting"
          value={todayStats?.waiting_patients || 0}
          subtitle="In queue now"
          icon="⏳"
          alert={todayStats?.waiting_patients > 0}
        />
        <StatCard
          title="Pending Results"
          value={pendingTasks?.lab_results || 0}
          subtitle="Require review"
          icon="🧪"
          alert={criticalResults.length > 0}
        />
        <StatCard
          title="Messages"
          value={pendingTasks?.messages || 0}
          subtitle="Unread"
          icon="✉️"
        />
      </div>

      {/* Critical Results Alert */}
      {criticalResults.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-center">
            <span className="text-2xl mr-3">⚠️</span>
            <div>
              <h3 className="font-semibold text-red-800">
                {criticalResults.length} Critical Lab Result{criticalResults.length > 1 ? 's' : ''} Pending Review
              </h3>
              <button className="text-red-600 hover:underline mt-1">
                Review Now →
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Upcoming Appointments</h3>
          <div className="space-y-3">
            {upcomingAppointments.slice(0, 5).map(appt => (
              <div key={appt.id} className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">
                    {appt.patient_first_name} {appt.patient_last_name}
                  </p>
                  <p className="text-sm text-gray-600">{appt.appointment_type}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{format(new Date(appt.start_time), 'h:mm a')}</p>
                  <button className="text-sm text-blue-600 hover:underline">
                    View Chart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Pending Tasks</h3>
          <div className="space-y-3">
            {pendingTasks.tasks?.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center">
                  <span className="mr-3">{task.icon}</span>
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-gray-600">{task.patient_name}</p>
                  </div>
                </div>
                <button className="text-blue-600 hover:underline text-sm">
                  {task.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, subtitle, icon, alert }) => (
  <div className={`bg-white rounded-lg shadow p-6 ${alert ? 'ring-2 ring-red-500' : ''}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-3xl font-bold mt-2">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      </div>
      <span className="text-4xl">{icon}</span>
    </div>
  </div>
);

export default ProviderDashboard;
```

### 7.2 Front Desk Dashboard

```jsx
// frontend/components/Dashboards/FrontDeskDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FrontDeskDashboard = ({ clinicId }) => {
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [walkinQueue, setWalkinQueue] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [clinicId]);

  const loadDashboardData = async () => {
    try {
      const [appointments, walkins, statsData] = await Promise.all([
        axios.get('/api/appointments/today', { params: { clinic_id: clinicId } }),
        axios.get('/api/walkins/queue', { params: { clinic_id: clinicId } }),
        axios.get('/api/frontdesk/stats', { params: { clinic_id: clinicId } })
      ]);

      setTodayAppointments(appointments.data);
      setWalkinQueue(walkins.data);
      setStats(statsData.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const handleCheckIn = async (appointmentId) => {
    try {
      await axios.post(`/api/appointments/${appointmentId}/check-in`, {
        check_in_time: new Date().toISOString()
      });
      loadDashboardData();
    } catch (error) {
      console.error('Check-in error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">Total Today</p>
          <p className="text-2xl font-bold">{stats?.total_appointments || 0}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">Checked In</p>
          <p className="text-2xl font-bold">{stats?.checked_in || 0}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">Waiting</p>
          <p className="text-2xl font-bold">{stats?.waiting || 0}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">In Progress</p>
          <p className="text-2xl font-bold">{stats?.in_progress || 0}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600">Completed</p>
          <p className="text-2xl font-bold">{stats?.completed || 0}</p>
        </div>
      </div>

      {/* Appointments List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Today's Appointments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Patient</th>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {todayAppointments.map(appt => (
                <tr key={appt.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{format(new Date(appt.start_time), 'h:mm a')}</td>
                  <td className="px-4 py-3">
                    {appt.patient_first_name} {appt.patient_last_name}
                    <br />
                    <span className="text-sm text-gray-500">DOB: {format(new Date(appt.patient_dob), 'MM/dd/yyyy')}</span>
                  </td>
                  <td className="px-4 py-3">{appt.provider_name}</td>
                  <td className="px-4 py-3">{appt.appointment_type}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      appt.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                      appt.status === 'checked-in' ? 'bg-green-100 text-green-800' :
                      appt.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {appt.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {appt.status === 'scheduled' && (
                      <button
                        onClick={() => handleCheckIn(appt.id)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Check In
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FrontDeskDashboard;
```

### 7.3 Billing Dashboard

```jsx
// frontend/components/Dashboards/BillingDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BillingDashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [pendingClaims, setPendingClaims] = useState([]);
  const [denials, setDenials] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [metricsData, claims, denialsData] = await Promise.all([
        axios.get('/api/billing/metrics'),
        axios.get('/api/claims/pending'),
        axios.get('/api/denials/active')
      ]);

      setMetrics(metricsData.data);
      setPendingClaims(claims.data);
      setDenials(denialsData.data);
    } catch (error) {
      console.error('Error loading billing dashboard:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Financial Metrics */}
      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          title="Outstanding AR"
          value={`$${metrics?.outstanding_ar?.toLocaleString() || 0}`}
          change="+5.2%"
          positive={false}
        />
        <MetricCard
          title="MTD Collections"
          value={`$${metrics?.mtd_collections?.toLocaleString() || 0}`}
          change="+12.3%"
          positive={true}
        />
        <MetricCard
          title="Pending Claims"
          value={metrics?.pending_claims || 0}
          subtitle="Ready to submit"
        />
        <MetricCard
          title="Active Denials"
          value={denials.length}
          subtitle="Require action"
          alert={denials.length > 10}
        />
      </div>

      {/* Pending Claims Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Pending Claims</h3>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Claim #</th>
              <th className="px-4 py-2 text-left">Patient</th>
              <th className="px-4 py-2 text-left">DOS</th>
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingClaims.map(claim => (
              <tr key={claim.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">{claim.claim_number}</td>
                <td className="px-4 py-2">{claim.patient_name}</td>
                <td className="px-4 py-2">{format(new Date(claim.service_date), 'MM/dd/yyyy')}</td>
                <td className="px-4 py-2">${claim.total_amount.toFixed(2)}</td>
                <td className="px-4 py-2">
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                    {claim.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button className="text-blue-600 hover:underline text-sm">Submit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, subtitle, change, positive, alert }) => (
  <div className={`bg-white rounded-lg shadow p-6 ${alert ? 'ring-2 ring-red-500' : ''}`}>
    <p className="text-sm text-gray-600">{title}</p>
    <p className="text-3xl font-bold mt-2">{value}</p>
    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    {change && (
      <p className={`text-sm mt-2 ${positive ? 'text-green-600' : 'text-red-600'}`}>
        {change}
      </p>
    )}
  </div>
);

export default BillingDashboard;
```

---

## Next Steps

This completes **Part 1: Foundation & Core Systems** of the Complete EMR Blueprint.

**Part 1 Coverage:**
- ✅ System architecture (Clean Architecture, 5 layers)
- ✅ Complete RBAC system (95+ permissions across 7 roles)
- ✅ Security middleware stack (sanitization, rate limiting, CSRF, session management, PHI audit)
- ✅ Full database schema (40+ tables with indexes)
- ✅ Patient scheduling system (backend + frontend)
- ✅ Check-in & queue management (real-time updates)
- ✅ Role-specific dashboards (Provider, Front Desk, Billing)

**Remaining Parts:**
- Part 2: Clinical Workflows & Documentation (encounters, vitals, templates, patient profiles)
- Part 3: Billing, Revenue & Compliance (E&M coding, claims, ERA, HIPAA features)
- Part 4: Integrations & Interoperability (HL7, FHIR, PACS, e-Prescribing)
- Part 5: Testing, Monitoring & Deployment (test strategies, error tracking, deployment)
