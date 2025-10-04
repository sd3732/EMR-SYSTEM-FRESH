# COMPLETE EMR BLUEPRINT - PART 2: CLINICAL WORKFLOWS & DOCUMENTATION

## Table of Contents
1. [Encounter Workflow System](#1-encounter-workflow-system)
2. [Encounter Templates & Auto-Population](#2-encounter-templates--auto-population)
3. [Vitals Recording & Tracking](#3-vitals-recording--tracking)
4. [Lab Orders & Critical Value Management](#4-lab-orders--critical-value-management)
5. [Imaging Orders & PACS Integration](#5-imaging-orders--pacs-integration)
6. [Referral Management](#6-referral-management)
7. [Patient Profile & Medical History](#7-patient-profile--medical-history)
8. [Visit History & Continuity of Care](#8-visit-history--continuity-of-care)

---

## 1. Encounter Workflow System

### 1.1 Five-Stage Encounter Workflow

The encounter system implements a **structured 5-stage clinical documentation workflow** with auto-save and real-time validation:

```
Stage 1: Review & Chief Complaint
    ↓
Stage 2: History of Present Illness (HPI)
    ↓
Stage 3: Review of Systems (ROS)
    ↓
Stage 4: Physical Examination
    ↓
Stage 5: Assessment & Plan
```

### 1.2 Encounter State Management

```javascript
// backend/useCases/CreateEncounterUseCase.js
const pool = require('../config/database');

class CreateEncounterUseCase {
  async execute(encounterData, providerId) {
    const {
      patient_id,
      appointment_id,
      encounter_type,
      clinic_id
    } = encounterData;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create encounter
      const encounterResult = await client.query(
        `INSERT INTO encounters
         (patient_id, provider_id, appointment_id, clinic_id, encounter_type,
          encounter_date, encounter_time, status)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_TIME, 'draft')
         RETURNING *`,
        [patient_id, providerId, appointment_id, clinic_id, encounter_type]
      );

      const encounter = encounterResult.rows[0];

      // Get patient's last encounter for continuity
      const lastEncounter = await this.getLastEncounter(client, patient_id, encounter.id);

      // Pre-populate from template if available
      const template = await this.getEncounterTemplate(client, encounter_type, providerId);

      // Pre-populate chronic conditions and active medications
      const [chronicConditions, activeMeds] = await Promise.all([
        this.getChronicConditions(client, patient_id),
        this.getActiveMedications(client, patient_id)
      ]);

      // Update queue status to "with provider"
      if (appointment_id) {
        await client.query(
          `UPDATE patient_queue
           SET status = 'with_provider', encounter_started_at = NOW()
           WHERE appointment_id = $1`,
          [appointment_id]
        );
      }

      await client.query('COMMIT');

      return {
        encounter,
        lastEncounter,
        template,
        chronicConditions,
        activeMedications: activeMeds
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLastEncounter(client, patientId, excludeId) {
    const result = await client.query(
      `SELECT
        id, encounter_date, chief_complaint, hpi, assessment, plan
       FROM encounters
       WHERE patient_id = $1 AND id != $2 AND status = 'signed'
       ORDER BY encounter_date DESC, encounter_time DESC
       LIMIT 1`,
      [patientId, excludeId]
    );
    return result.rows[0] || null;
  }

  async getEncounterTemplate(client, encounterType, providerId) {
    const result = await client.query(
      `SELECT * FROM encounter_templates
       WHERE encounter_type = $1
         AND (created_by = $2 OR created_by IS NULL)
         AND is_active = TRUE
       ORDER BY created_by DESC NULLS LAST
       LIMIT 1`,
      [encounterType, providerId]
    );
    return result.rows[0] || null;
  }

  async getChronicConditions(client, patientId) {
    const result = await client.query(
      `SELECT DISTINCT ON (icd10_code)
        ed.icd10_code,
        ed.description,
        e.encounter_date
       FROM encounter_diagnoses ed
       JOIN encounters e ON e.id = ed.encounter_id
       WHERE e.patient_id = $1
         AND ed.is_chronic = TRUE
         AND e.status = 'signed'
       ORDER BY icd10_code, e.encounter_date DESC`,
      [patientId]
    );
    return result.rows;
  }

  async getActiveMedications(client, patientId) {
    const result = await client.query(
      `SELECT * FROM prescriptions
       WHERE patient_id = $1
         AND status = 'active'
         AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ORDER BY prescribed_date DESC`,
      [patientId]
    );
    return result.rows;
  }
}

module.exports = CreateEncounterUseCase;
```

### 1.3 Auto-Save Functionality

```javascript
// backend/useCases/AutoSaveEncounterUseCase.js
const pool = require('../config/database');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

class AutoSaveEncounterUseCase {
  async execute(encounterId, sectionData, userId) {
    const {
      section, // 'chief_complaint', 'hpi', 'ros', 'physical_exam', 'assessment', 'plan'
      content
    } = sectionData;

    // Save to Redis for real-time auto-save (expires in 24 hours)
    const cacheKey = `encounter:${encounterId}:autosave:${section}`;
    await redis.setex(cacheKey, 86400, JSON.stringify({
      content,
      savedAt: new Date().toISOString(),
      savedBy: userId
    }));

    // Debounced database save (every 30 seconds)
    const dbSaveKey = `encounter:${encounterId}:db_save_pending`;
    const isPending = await redis.get(dbSaveKey);

    if (!isPending) {
      await redis.setex(dbSaveKey, 30, '1');

      // Schedule database save after 30 seconds
      setTimeout(async () => {
        await this.saveToDatabase(encounterId);
      }, 30000);
    }

    return { ok: true, savedAt: new Date().toISOString() };
  }

  async saveToDatabase(encounterId) {
    try {
      // Retrieve all cached sections
      const sections = ['chief_complaint', 'hpi', 'ros', 'physical_exam', 'assessment', 'plan'];
      const updates = {};

      for (const section of sections) {
        const cacheKey = `encounter:${encounterId}:autosave:${section}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          updates[section] = data.content;
        }
      }

      if (Object.keys(updates).length === 0) return;

      // Build dynamic update query
      const setClause = Object.keys(updates)
        .map((key, idx) => `${key} = $${idx + 2}`)
        .join(', ');

      const values = [encounterId, ...Object.values(updates)];

      await pool.query(
        `UPDATE encounters
         SET ${setClause}, updated_at = NOW()
         WHERE id = $1`,
        values
      );

      console.log(`Encounter ${encounterId} auto-saved to database`);
    } catch (error) {
      console.error('Auto-save to database error:', error);
    }
  }

  /**
   * Retrieve auto-saved content
   */
  async getAutoSavedContent(encounterId) {
    const sections = ['chief_complaint', 'hpi', 'ros', 'physical_exam', 'assessment', 'plan'];
    const content = {};

    for (const section of sections) {
      const cacheKey = `encounter:${encounterId}:autosave:${section}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        content[section] = JSON.parse(cached);
      }
    }

    return content;
  }
}

module.exports = AutoSaveEncounterUseCase;
```

### 1.4 Encounter Signing & Locking

```javascript
// backend/useCases/SignEncounterUseCase.js
const pool = require('../config/database');

class SignEncounterUseCase {
  async execute(encounterId, providerId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify encounter belongs to provider
      const encounterCheck = await client.query(
        `SELECT * FROM encounters WHERE id = $1 AND provider_id = $2`,
        [encounterId, providerId]
      );

      if (encounterCheck.rows.length === 0) {
        throw new Error('Encounter not found or access denied');
      }

      const encounter = encounterCheck.rows[0];

      if (encounter.status === 'signed') {
        throw new Error('Encounter already signed');
      }

      // Validate required fields
      this.validateEncounterCompleteness(encounter);

      // Sign and lock encounter
      await client.query(
        `UPDATE encounters
         SET status = 'signed',
             signed_by = $1,
             signed_at = NOW(),
             locked = TRUE,
             locked_by = $1,
             locked_at = NOW()
         WHERE id = $2`,
        [providerId, encounterId]
      );

      // Update queue status to completed
      if (encounter.appointment_id) {
        await client.query(
          `UPDATE patient_queue
           SET status = 'completed', encounter_completed_at = NOW()
           WHERE appointment_id = $1`,
          [encounter.appointment_id]
        );
      }

      // Update appointment status
      if (encounter.appointment_id) {
        await client.query(
          `UPDATE appointments SET status = 'completed' WHERE id = $1`,
          [encounter.appointment_id]
        );
      }

      // Trigger billing workflow if charges exist
      await this.triggerBillingWorkflow(client, encounterId);

      await client.query('COMMIT');

      return { ok: true, encounterId, signedAt: new Date() };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  validateEncounterCompleteness(encounter) {
    const required = ['chief_complaint', 'hpi', 'assessment', 'plan'];
    const missing = required.filter(field => !encounter[field] || encounter[field].trim() === '');

    if (missing.length > 0) {
      throw new Error(`Required fields missing: ${missing.join(', ')}`);
    }

    // Validate at least one diagnosis
    if (!encounter.has_diagnoses) {
      throw new Error('At least one diagnosis code is required');
    }
  }

  async triggerBillingWorkflow(client, encounterId) {
    // Check if charges exist
    const chargesResult = await client.query(
      `SELECT COUNT(*) as count FROM charges WHERE encounter_id = $1`,
      [encounterId]
    );

    if (parseInt(chargesResult.rows[0].count) > 0) {
      // Create claim draft
      await client.query(
        `INSERT INTO claims (encounter_id, patient_id, clinic_id, status)
         SELECT encounter_id, patient_id, clinic_id, 'draft'
         FROM charges
         WHERE encounter_id = $1
         LIMIT 1`,
        [encounterId]
      );
    }
  }
}

module.exports = SignEncounterUseCase;
```

### 1.5 Encounter Addendum

```javascript
// backend/useCases/AddEncounterAddendumUseCase.js
const pool = require('../config/database');

class AddEncounterAddendumUseCase {
  async execute(encounterId, addendumText, providerId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify encounter is signed and belongs to provider
      const encounterResult = await client.query(
        `SELECT * FROM encounters
         WHERE id = $1 AND provider_id = $2 AND status = 'signed'`,
        [encounterId, providerId]
      );

      if (encounterResult.rows.length === 0) {
        throw new Error('Encounter not found or cannot be amended');
      }

      // Create addendum record
      await client.query(
        `INSERT INTO encounter_addenda
         (encounter_id, addendum_text, created_by, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [encounterId, addendumText, providerId]
      );

      // Log the addendum in audit trail
      await client.query(
        `INSERT INTO phi_audit_log
         (user_id, action, resource_type, resource_id, data_accessed, timestamp)
         VALUES ($1, 'ADDENDUM', 'encounter', $2, $3, NOW())`,
        [providerId, encounterId, JSON.stringify({ addendum_length: addendumText.length })]
      );

      await client.query('COMMIT');

      return { ok: true, message: 'Addendum added successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = AddEncounterAddendumUseCase;
```

### 1.6 Frontend: Encounter Form Component

```jsx
// frontend/components/Encounter/EncounterForm.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { debounce } from 'lodash';
import { useParams } from 'react-router-dom';

const EncounterForm = () => {
  const { encounterId } = useParams();
  const [activeStage, setActiveStage] = useState(1);
  const [encounter, setEncounter] = useState({
    chief_complaint: '',
    hpi: '',
    ros: {},
    physical_exam: {},
    assessment: '',
    plan: ''
  });
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    loadEncounter();
  }, [encounterId]);

  const loadEncounter = async () => {
    try {
      const response = await axios.get(`/api/encounters/${encounterId}`);
      setEncounter(response.data);
    } catch (error) {
      console.error('Error loading encounter:', error);
    }
  };

  // Auto-save with debounce
  const autoSave = useCallback(
    debounce(async (section, content) => {
      setSaving(true);
      try {
        await axios.post(`/api/encounters/${encounterId}/autosave`, {
          section,
          content
        });
        setLastSaved(new Date());
      } catch (error) {
        console.error('Auto-save error:', error);
      } finally {
        setSaving(false);
      }
    }, 2000),
    [encounterId]
  );

  const handleFieldChange = (section, value) => {
    setEncounter(prev => ({ ...prev, [section]: value }));
    autoSave(section, value);
  };

  const handleSign = async () => {
    if (!window.confirm('Are you sure you want to sign this encounter? It cannot be edited after signing.')) {
      return;
    }

    try {
      await axios.post(`/api/encounters/${encounterId}/sign`);
      alert('Encounter signed successfully');
      window.location.href = '/dashboard';
    } catch (error) {
      alert(`Error signing encounter: ${error.response?.data?.error || error.message}`);
    }
  };

  const stages = [
    { number: 1, title: 'Chief Complaint', section: 'chief_complaint' },
    { number: 2, title: 'HPI', section: 'hpi' },
    { number: 3, title: 'ROS', section: 'ros' },
    { number: 4, title: 'Physical Exam', section: 'physical_exam' },
    { number: 5, title: 'Assessment & Plan', section: 'assessment_plan' }
  ];

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Stage Navigation */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="flex items-center justify-between p-4">
          <div className="flex space-x-2">
            {stages.map(stage => (
              <button
                key={stage.number}
                onClick={() => setActiveStage(stage.number)}
                className={`px-4 py-2 rounded ${
                  activeStage === stage.number
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {stage.number}. {stage.title}
              </button>
            ))}
          </div>
          <div className="text-sm text-gray-500">
            {saving ? (
              <span className="text-blue-600">Saving...</span>
            ) : lastSaved ? (
              <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Stage Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {activeStage === 1 && (
          <ChiefComplaintSection
            value={encounter.chief_complaint}
            onChange={(value) => handleFieldChange('chief_complaint', value)}
          />
        )}

        {activeStage === 2 && (
          <HPISection
            value={encounter.hpi}
            onChange={(value) => handleFieldChange('hpi', value)}
          />
        )}

        {activeStage === 3 && (
          <ROSSection
            value={encounter.ros}
            onChange={(value) => handleFieldChange('ros', value)}
          />
        )}

        {activeStage === 4 && (
          <PhysicalExamSection
            value={encounter.physical_exam}
            onChange={(value) => handleFieldChange('physical_exam', value)}
          />
        )}

        {activeStage === 5 && (
          <AssessmentPlanSection
            encounterId={encounterId}
            assessment={encounter.assessment}
            plan={encounter.plan}
            onAssessmentChange={(value) => handleFieldChange('assessment', value)}
            onPlanChange={(value) => handleFieldChange('plan', value)}
          />
        )}
      </div>

      {/* Navigation & Actions */}
      <div className="mt-6 flex items-center justify-between">
        <div className="space-x-3">
          {activeStage > 1 && (
            <button
              onClick={() => setActiveStage(activeStage - 1)}
              className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Previous
            </button>
          )}
          {activeStage < 5 && (
            <button
              onClick={() => setActiveStage(activeStage + 1)}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Next
            </button>
          )}
        </div>

        {activeStage === 5 && (
          <button
            onClick={handleSign}
            className="px-8 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
          >
            Sign & Complete Encounter
          </button>
        )}
      </div>
    </div>
  );
};

const ChiefComplaintSection = ({ value, onChange }) => (
  <div>
    <h2 className="text-xl font-semibold mb-4">Chief Complaint</h2>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter chief complaint..."
      className="w-full h-32 p-3 border rounded focus:ring-2 focus:ring-blue-500"
    />
  </div>
);

const HPISection = ({ value, onChange }) => (
  <div>
    <h2 className="text-xl font-semibold mb-4">History of Present Illness</h2>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter HPI using OLDCARTS format: Onset, Location, Duration, Character, Aggravating factors, Relieving factors, Timing, Severity..."
      className="w-full h-64 p-3 border rounded focus:ring-2 focus:ring-blue-500"
    />
    <div className="mt-3 p-3 bg-blue-50 rounded">
      <p className="text-sm text-blue-800">
        <strong>Tip:</strong> Include Onset, Location, Duration, Character, Aggravating/Relieving factors, Timing, Severity
      </p>
    </div>
  </div>
);

const ROSSection = ({ value, onChange }) => {
  const systems = [
    'Constitutional', 'Eyes', 'ENT', 'Cardiovascular', 'Respiratory',
    'Gastrointestinal', 'Genitourinary', 'Musculoskeletal', 'Skin',
    'Neurological', 'Psychiatric', 'Endocrine', 'Hematologic', 'Allergic'
  ];

  const handleSystemChange = (system, finding) => {
    onChange({ ...value, [system]: finding });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Review of Systems</h2>
      <div className="space-y-3">
        {systems.map(system => (
          <div key={system} className="flex items-center space-x-4">
            <label className="w-40 font-medium">{system}:</label>
            <select
              value={value[system] || ''}
              onChange={(e) => handleSystemChange(system, e.target.value)}
              className="flex-1 p-2 border rounded"
            >
              <option value="">Not reviewed</option>
              <option value="negative">Negative</option>
              <option value="positive">Positive - see HPI</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

const PhysicalExamSection = ({ value, onChange }) => {
  const examSystems = [
    'Constitutional', 'Head', 'Eyes', 'ENT', 'Neck', 'Cardiovascular',
    'Respiratory', 'Gastrointestinal', 'Genitourinary', 'Musculoskeletal',
    'Skin', 'Neurological', 'Psychiatric'
  ];

  const handleSystemChange = (system, findings) => {
    onChange({ ...value, [system]: findings });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Physical Examination</h2>
      <div className="space-y-4">
        {examSystems.map(system => (
          <div key={system}>
            <label className="block font-medium mb-1">{system}</label>
            <textarea
              value={value[system] || ''}
              onChange={(e) => handleSystemChange(system, e.target.value)}
              placeholder={`Enter ${system.toLowerCase()} exam findings...`}
              className="w-full h-20 p-2 border rounded"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const AssessmentPlanSection = ({ encounterId, assessment, plan, onAssessmentChange, onPlanChange }) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold mb-4">Assessment</h2>
      <DiagnosisSelector encounterId={encounterId} />
      <textarea
        value={assessment}
        onChange={(e) => onAssessmentChange(e.target.value)}
        placeholder="Enter clinical impression and assessment..."
        className="w-full h-32 p-3 border rounded mt-4"
      />
    </div>

    <div>
      <h2 className="text-xl font-semibold mb-4">Plan</h2>
      <textarea
        value={plan}
        onChange={(e) => onPlanChange(e.target.value)}
        placeholder="Enter treatment plan, follow-up instructions, patient education..."
        className="w-full h-48 p-3 border rounded"
      />
    </div>
  </div>
);

const DiagnosisSelector = ({ encounterId }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);

  const searchDiagnoses = useCallback(
    debounce(async (query) => {
      if (query.length < 2) return;
      try {
        const response = await axios.get('/api/icd10/search', {
          params: { q: query, limit: 10 }
        });
        setResults(response.data);
      } catch (error) {
        console.error('Diagnosis search error:', error);
      }
    }, 300),
    []
  );

  useEffect(() => {
    searchDiagnoses(search);
  }, [search]);

  const addDiagnosis = async (diagnosis) => {
    try {
      await axios.post(`/api/encounters/${encounterId}/diagnoses`, {
        icd10_code: diagnosis.code,
        description: diagnosis.description,
        is_primary: selected.length === 0
      });
      setSelected([...selected, diagnosis]);
      setSearch('');
      setResults([]);
    } catch (error) {
      console.error('Error adding diagnosis:', error);
    }
  };

  return (
    <div>
      <h3 className="font-semibold mb-2">Diagnoses (ICD-10)</h3>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ICD-10 codes..."
          className="w-full p-2 border rounded"
        />
        {results.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-y-auto">
            {results.map(result => (
              <div
                key={result.code}
                onClick={() => addDiagnosis(result)}
                className="p-2 hover:bg-gray-100 cursor-pointer"
              >
                <span className="font-mono text-sm text-blue-600">{result.code}</span>
                {' - '}
                <span>{result.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {selected.map((dx, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <span>
              {idx === 0 && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">PRIMARY</span>}
              <span className="font-mono text-sm">{dx.code}</span> - {dx.description}
            </span>
            <button className="text-red-600 hover:text-red-800">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EncounterForm;
```

---

## 2. Encounter Templates & Auto-Population

### 2.1 Template Creation System

```javascript
// backend/useCases/CreateEncounterTemplateUseCase.js
const pool = require('../config/database');

class CreateEncounterTemplateUseCase {
  async execute(templateData, userId) {
    const {
      name,
      specialty,
      encounter_type,
      chief_complaint_template,
      hpi_template,
      ros_template,
      physical_exam_template,
      assessment_template,
      plan_template,
      default_diagnoses, // Array of common ICD-10 codes
      default_orders // Array of common orders
    } = templateData;

    const result = await pool.query(
      `INSERT INTO encounter_templates
       (name, specialty, encounter_type, chief_complaint_template, hpi_template,
        ros_template, physical_exam_template, assessment_template, plan_template,
        default_diagnoses, default_orders, created_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
       RETURNING *`,
      [
        name, specialty, encounter_type, chief_complaint_template, hpi_template,
        ros_template, physical_exam_template, assessment_template, plan_template,
        JSON.stringify(default_diagnoses || []),
        JSON.stringify(default_orders || []),
        userId
      ]
    );

    return result.rows[0];
  }
}

module.exports = CreateEncounterTemplateUseCase;
```

### 2.2 Smart Auto-Population Logic

```javascript
// backend/useCases/ApplyEncounterTemplateUseCase.js
const pool = require('../config/database');

class ApplyEncounterTemplateUseCase {
  async execute(encounterId, templateId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get template
      const templateResult = await client.query(
        `SELECT * FROM encounter_templates WHERE id = $1`,
        [templateId]
      );

      if (templateResult.rows.length === 0) {
        throw new Error('Template not found');
      }

      const template = templateResult.rows[0];

      // Get encounter
      const encounterResult = await client.query(
        `SELECT * FROM encounters WHERE id = $1`,
        [encounterId]
      );

      const encounter = encounterResult.rows[0];

      // Apply template with smart merge
      const updates = {
        chief_complaint: this.mergeContent(encounter.chief_complaint, template.chief_complaint_template),
        hpi: this.mergeContent(encounter.hpi, template.hpi_template),
        ros: this.mergeJSON(encounter.ros, template.ros_template),
        physical_exam: this.mergeJSON(encounter.physical_exam, template.physical_exam_template),
        assessment: this.mergeContent(encounter.assessment, template.assessment_template),
        plan: this.mergeContent(encounter.plan, template.plan_template)
      };

      // Update encounter
      await client.query(
        `UPDATE encounters
         SET chief_complaint = $1, hpi = $2, ros = $3,
             physical_exam = $4, assessment = $5, plan = $6
         WHERE id = $7`,
        [
          updates.chief_complaint,
          updates.hpi,
          updates.ros,
          updates.physical_exam,
          updates.assessment,
          updates.plan,
          encounterId
        ]
      );

      // Add default diagnoses if specified
      if (template.default_diagnoses && template.default_diagnoses.length > 0) {
        for (const [index, diagnosisCode] of template.default_diagnoses.entries()) {
          const diagnosisInfo = await this.getDiagnosisInfo(client, diagnosisCode);
          if (diagnosisInfo) {
            await client.query(
              `INSERT INTO encounter_diagnoses
               (encounter_id, icd10_code, description, is_primary, rank)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [encounterId, diagnosisCode, diagnosisInfo.description, index === 0, index + 1]
            );
          }
        }
      }

      await client.query('COMMIT');

      return { ok: true, message: 'Template applied successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Smart merge: Keep existing content if present, otherwise use template
   */
  mergeContent(existing, template) {
    if (existing && existing.trim().length > 0) {
      return existing;
    }
    return template || '';
  }

  /**
   * Merge JSON objects
   */
  mergeJSON(existing, template) {
    const existingObj = typeof existing === 'string' ? JSON.parse(existing || '{}') : existing || {};
    const templateObj = typeof template === 'string' ? JSON.parse(template || '{}') : template || {};

    return { ...templateObj, ...existingObj };
  }

  async getDiagnosisInfo(client, icd10Code) {
    const result = await client.query(
      `SELECT code, description FROM icd10_codes WHERE code = $1`,
      [icd10Code]
    );
    return result.rows[0];
  }
}

module.exports = ApplyEncounterTemplateUseCase;
```

### 2.3 Template Library Component

```jsx
// frontend/components/Templates/TemplateLibrary.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const TemplateLibrary = ({ onSelectTemplate }) => {
  const [templates, setTemplates] = useState([]);
  const [filter, setFilter] = useState({ specialty: '', encounter_type: '' });

  useEffect(() => {
    loadTemplates();
  }, [filter]);

  const loadTemplates = async () => {
    try {
      const response = await axios.get('/api/encounter-templates', {
        params: filter
      });
      setTemplates(response.data);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Encounter Templates</h2>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <select
          value={filter.specialty}
          onChange={(e) => setFilter({ ...filter, specialty: e.target.value })}
          className="p-2 border rounded"
        >
          <option value="">All Specialties</option>
          <option value="Family Medicine">Family Medicine</option>
          <option value="Internal Medicine">Internal Medicine</option>
          <option value="Pediatrics">Pediatrics</option>
          <option value="Cardiology">Cardiology</option>
        </select>

        <select
          value={filter.encounter_type}
          onChange={(e) => setFilter({ ...filter, encounter_type: e.target.value })}
          className="p-2 border rounded"
        >
          <option value="">All Types</option>
          <option value="Office Visit">Office Visit</option>
          <option value="Annual Physical">Annual Physical</option>
          <option value="Follow-up">Follow-up</option>
          <option value="Urgent Care">Urgent Care</option>
        </select>
      </div>

      {/* Template List */}
      <div className="space-y-3">
        {templates.map(template => (
          <div
            key={template.id}
            className="border rounded p-4 hover:bg-gray-50 cursor-pointer"
            onClick={() => onSelectTemplate(template)}
          >
            <h3 className="font-semibold">{template.name}</h3>
            <div className="text-sm text-gray-600 mt-1">
              <span>{template.specialty}</span> • <span>{template.encounter_type}</span>
            </div>
            {template.default_diagnoses && template.default_diagnoses.length > 0 && (
              <div className="text-xs text-gray-500 mt-2">
                Includes {template.default_diagnoses.length} default diagnosis codes
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateLibrary;
```

---

## 3. Vitals Recording & Tracking

### 3.1 Vitals Recording Backend

```javascript
// backend/useCases/RecordVitalsUseCase.js
const pool = require('../config/database');

class RecordVitalsUseCase {
  async execute(vitalsData, recordedBy) {
    const {
      patient_id,
      appointment_id,
      height_inches,
      weight_lbs,
      temperature_f,
      pulse_bpm,
      respiratory_rate,
      bp_systolic,
      bp_diastolic,
      o2_saturation,
      pain_level,
      notes
    } = vitalsData;

    // Calculate BMI
    const bmi = this.calculateBMI(height_inches, weight_lbs);

    const result = await pool.query(
      `INSERT INTO vitals
       (patient_id, appointment_id, recorded_by, height_inches, weight_lbs, bmi,
        temperature_f, pulse_bpm, respiratory_rate, bp_systolic, bp_diastolic,
        o2_saturation, pain_level, notes, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING *`,
      [
        patient_id, appointment_id, recordedBy, height_inches, weight_lbs, bmi,
        temperature_f, pulse_bpm, respiratory_rate, bp_systolic, bp_diastolic,
        o2_saturation, pain_level, notes
      ]
    );

    const vitals = result.rows[0];

    // Check for critical vitals
    const alerts = this.checkCriticalVitals(vitals);

    // Update queue status
    if (appointment_id) {
      await pool.query(
        `UPDATE patient_queue
         SET vitals_completed = TRUE, vitals_completed_at = NOW(), status = 'ready_for_provider'
         WHERE appointment_id = $1`,
        [appointment_id]
      );
    }

    // Send alerts if critical values detected
    if (alerts.length > 0) {
      await this.notifyProvider(patient_id, alerts);
    }

    return {
      vitals,
      alerts
    };
  }

  calculateBMI(heightInches, weightLbs) {
    if (!heightInches || !weightLbs) return null;
    return parseFloat(((weightLbs / (heightInches * heightInches)) * 703).toFixed(1));
  }

  checkCriticalVitals(vitals) {
    const alerts = [];

    // Blood Pressure
    if (vitals.bp_systolic >= 180 || vitals.bp_diastolic >= 120) {
      alerts.push({
        type: 'CRITICAL',
        parameter: 'Blood Pressure',
        value: `${vitals.bp_systolic}/${vitals.bp_diastolic}`,
        message: 'Hypertensive Crisis'
      });
    }

    // Temperature
    if (vitals.temperature_f >= 103) {
      alerts.push({
        type: 'CRITICAL',
        parameter: 'Temperature',
        value: vitals.temperature_f,
        message: 'High Fever'
      });
    }

    // Oxygen Saturation
    if (vitals.o2_saturation < 90) {
      alerts.push({
        type: 'CRITICAL',
        parameter: 'O2 Saturation',
        value: vitals.o2_saturation,
        message: 'Hypoxemia'
      });
    }

    // Heart Rate
    if (vitals.pulse_bpm > 120 || vitals.pulse_bpm < 50) {
      alerts.push({
        type: 'ABNORMAL',
        parameter: 'Heart Rate',
        value: vitals.pulse_bpm,
        message: vitals.pulse_bpm > 120 ? 'Tachycardia' : 'Bradycardia'
      });
    }

    return alerts;
  }

  async notifyProvider(patientId, alerts) {
    // Implementation: Send alert to provider via WebSocket/SMS/Email
    console.log('Critical vitals alert:', { patientId, alerts });
  }
}

module.exports = RecordVitalsUseCase;
```

### 3.2 Vitals Entry Form Component

```jsx
// frontend/components/Vitals/VitalsForm.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useSearchParams } from 'react-router-dom';

const VitalsForm = () => {
  const { patientId } = useParams();
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('appointment_id');
  const queueId = searchParams.get('queue_id');

  const [vitals, setVitals] = useState({
    height_inches: '',
    weight_lbs: '',
    temperature_f: '',
    pulse_bpm: '',
    respiratory_rate: '',
    bp_systolic: '',
    bp_diastolic: '',
    o2_saturation: '',
    pain_level: '',
    notes: ''
  });

  const [bmi, setBMI] = useState(null);
  const [lastVitals, setLastVitals] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    loadLastVitals();
  }, [patientId]);

  useEffect(() => {
    if (vitals.height_inches && vitals.weight_lbs) {
      const calculatedBMI = (
        (parseFloat(vitals.weight_lbs) / (parseFloat(vitals.height_inches) ** 2)) * 703
      ).toFixed(1);
      setBMI(calculatedBMI);
    }
  }, [vitals.height_inches, vitals.weight_lbs]);

  const loadLastVitals = async () => {
    try {
      const response = await axios.get(`/api/patients/${patientId}/vitals/latest`);
      setLastVitals(response.data);
      // Pre-populate height from last visit
      if (response.data?.height_inches) {
        setVitals(v => ({ ...v, height_inches: response.data.height_inches }));
      }
    } catch (error) {
      console.error('Error loading last vitals:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post('/api/vitals', {
        patient_id: patientId,
        appointment_id: appointmentId,
        ...vitals
      });

      if (response.data.alerts && response.data.alerts.length > 0) {
        setAlerts(response.data.alerts);
        alert(`Critical vitals detected! Provider will be notified.`);
      }

      alert('Vitals recorded successfully');
      window.location.href = `/queue`;
    } catch (error) {
      alert(`Error recording vitals: ${error.response?.data?.error || error.message}`);
    }
  };

  const getBPCategory = (systolic, diastolic) => {
    if (systolic >= 180 || diastolic >= 120) return { text: 'Hypertensive Crisis', color: 'text-red-700' };
    if (systolic >= 140 || diastolic >= 90) return { text: 'Hypertension', color: 'text-orange-600' };
    if (systolic >= 130 || diastolic >= 80) return { text: 'Elevated', color: 'text-yellow-600' };
    return { text: 'Normal', color: 'text-green-600' };
  };

  const getBMICategory = (bmiValue) => {
    if (bmiValue < 18.5) return { text: 'Underweight', color: 'text-blue-600' };
    if (bmiValue < 25) return { text: 'Normal', color: 'text-green-600' };
    if (bmiValue < 30) return { text: 'Overweight', color: 'text-yellow-600' };
    return { text: 'Obese', color: 'text-red-600' };
  };

  const bpCategory = getBPCategory(
    parseFloat(vitals.bp_systolic),
    parseFloat(vitals.bp_diastolic)
  );

  const bmiCategory = bmi ? getBMICategory(parseFloat(bmi)) : null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-6">Record Vitals</h2>

        {/* Last Vitals Reference */}
        {lastVitals && (
          <div className="mb-6 p-4 bg-blue-50 rounded">
            <h3 className="font-semibold mb-2">Last Recorded Vitals</h3>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>BP: {lastVitals.bp_systolic}/{lastVitals.bp_diastolic}</div>
              <div>Pulse: {lastVitals.pulse_bpm} bpm</div>
              <div>Temp: {lastVitals.temperature_f}°F</div>
              <div>O2: {lastVitals.o2_saturation}%</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Height & Weight */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Height (inches) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={vitals.height_inches}
                onChange={(e) => setVitals({ ...vitals, height_inches: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Weight (lbs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={vitals.weight_lbs}
                onChange={(e) => setVitals({ ...vitals, weight_lbs: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">BMI</label>
              <div className="p-2 bg-gray-50 rounded">
                <span className="text-lg font-semibold">{bmi || '--'}</span>
                {bmiCategory && (
                  <span className={`ml-2 text-sm ${bmiCategory.color}`}>
                    ({bmiCategory.text})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Blood Pressure */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                BP Systolic <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={vitals.bp_systolic}
                onChange={(e) => setVitals({ ...vitals, bp_systolic: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                BP Diastolic <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={vitals.bp_diastolic}
                onChange={(e) => setVitals({ ...vitals, bp_diastolic: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <div className="p-2 bg-gray-50 rounded">
                {vitals.bp_systolic && vitals.bp_diastolic ? (
                  <span className={`font-semibold ${bpCategory.color}`}>
                    {bpCategory.text}
                  </span>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </div>
            </div>
          </div>

          {/* Other Vitals */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Temperature (°F) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={vitals.temperature_f}
                onChange={(e) => setVitals({ ...vitals, temperature_f: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Pulse (bpm) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={vitals.pulse_bpm}
                onChange={(e) => setVitals({ ...vitals, pulse_bpm: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Resp Rate <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={vitals.respiratory_rate}
                onChange={(e) => setVitals({ ...vitals, respiratory_rate: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                O2 Sat (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={vitals.o2_saturation}
                onChange={(e) => setVitals({ ...vitals, o2_saturation: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>
          </div>

          {/* Pain Level */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Pain Level (0-10)
            </label>
            <div className="flex items-center space-x-2">
              {[...Array(11)].map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setVitals({ ...vitals, pain_level: i })}
                  className={`w-10 h-10 rounded ${
                    vitals.pain_level === i
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={vitals.notes}
              onChange={(e) => setVitals({ ...vitals, notes: e.target.value })}
              className="w-full h-20 p-2 border rounded"
              placeholder="Any additional observations..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-6 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save Vitals
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VitalsForm;
```

### 3.3 Vitals Trend Chart

```jsx
// frontend/components/Vitals/VitalsTrendChart.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

const VitalsTrendChart = ({ patientId, vitalType }) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    loadVitalsHistory();
  }, [patientId, vitalType]);

  const loadVitalsHistory = async () => {
    try {
      const response = await axios.get(`/api/patients/${patientId}/vitals/history`, {
        params: { limit: 20 }
      });

      const formattedData = response.data.map(v => ({
        date: format(new Date(v.recorded_at), 'MM/dd/yy'),
        systolic: v.bp_systolic,
        diastolic: v.bp_diastolic,
        pulse: v.pulse_bpm,
        temp: v.temperature_f,
        o2: v.o2_saturation,
        weight: v.weight_lbs
      }));

      setData(formattedData.reverse());
    } catch (error) {
      console.error('Error loading vitals history:', error);
    }
  };

  const renderChart = () => {
    switch (vitalType) {
      case 'bp':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="systolic" stroke="#ef4444" name="Systolic" />
              <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" name="Diastolic" />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'weight':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="weight" stroke="#10b981" name="Weight (lbs)" />
            </LineChart>
          </ResponsiveContainer>
        );

      default:
        return <div>Select a vital sign to view trend</div>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Vitals Trend</h3>
      {renderChart()}
    </div>
  );
};

export default VitalsTrendChart;
```

---

## 4. Lab Orders & Critical Value Management

### 4.1 Lab Order Creation

```javascript
// backend/useCases/CreateLabOrderUseCase.js
const pool = require('../config/database');

class CreateLabOrderUseCase {
  async execute(orderData, orderingProviderId) {
    const {
      encounter_id,
      patient_id,
      priority,
      lab_facility,
      clinical_notes,
      tests // Array of { loinc_code, test_name, specimen_type }
    } = orderData;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create lab order
      const orderResult = await client.query(
        `INSERT INTO lab_orders
         (encounter_id, patient_id, ordering_provider_id, priority, lab_facility,
          clinical_notes, status, order_date)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
         RETURNING *`,
        [encounter_id, patient_id, orderingProviderId, priority, lab_facility, clinical_notes]
      );

      const labOrder = orderResult.rows[0];

      // Add individual tests
      for (const test of tests) {
        await client.query(
          `INSERT INTO lab_order_tests
           (lab_order_id, loinc_code, test_name, specimen_type)
           VALUES ($1, $2, $3, $4)`,
          [labOrder.id, test.loinc_code, test.test_name, test.specimen_type]
        );
      }

      // Generate HL7 ORM message for lab interface
      const hl7Message = await this.generateHL7ORM(labOrder, tests, patient_id);

      // Send to lab interface
      await this.sendToLabInterface(hl7Message, lab_facility);

      await client.query('COMMIT');

      return labOrder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generateHL7ORM(labOrder, tests, patientId) {
    // Implementation: Generate HL7 v2 ORM^O01 message
    return `MSH|^~\\&|EMR_SYSTEM|CLINIC|LAB_SYSTEM|LAB|${new Date().toISOString()}||ORM^O01|${labOrder.id}|P|2.5
PID|1||${patientId}|||...
ORC|NW|${labOrder.id}||...
OBR|1|${labOrder.id}||...`;
  }

  async sendToLabInterface(hl7Message, labFacility) {
    // Implementation: Send HL7 message via MLLP or API
    console.log('Sending lab order to facility:', labFacility);
  }
}

module.exports = CreateLabOrderUseCase;
```

### 4.2 Critical Lab Value Detection & Escalation

```javascript
// backend/useCases/HandleLabResultUseCase.js
const pool = require('../config/database');
const Bull = require('bull');

const criticalValueQueue = new Bull('critical-values', process.env.REDIS_URL);

// Critical value thresholds (LOINC-based)
const CRITICAL_VALUE_RULES = {
  '2345-7': { criticalLow: 40, criticalHigh: 500, unit: 'mg/dL', name: 'Glucose' },
  '6298-4': { criticalLow: 2.5, criticalHigh: 6.5, unit: 'mmol/L', name: 'Potassium' },
  '2951-2': { criticalLow: 120, criticalHigh: 160, unit: 'mmol/L', name: 'Sodium' },
  '718-7': { criticalLow: 5.0, criticalHigh: null, unit: 'g/dL', name: 'Hemoglobin' },
  '777-3': { criticalLow: 50000, criticalHigh: null, unit: '/uL', name: 'Platelets' },
  '2160-0': { criticalLow: null, criticalHigh: 15.0, unit: 'mg/dL', name: 'Creatinine' }
};

class HandleLabResultUseCase {
  async execute(resultData) {
    const {
      lab_order_id,
      loinc_code,
      test_name,
      value,
      units,
      reference_range,
      result_date
    } = resultData;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Detect critical and abnormal values
      const { isCritical, isAbnormal } = this.evaluateResult(loinc_code, value);

      // Save result
      const resultRecord = await client.query(
        `INSERT INTO lab_results
         (lab_order_id, loinc_code, test_name, value, units, reference_range,
          is_critical, is_abnormal, result_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          lab_order_id, loinc_code, test_name, value, units, reference_range,
          isCritical, isAbnormal, result_date
        ]
      );

      // Get ordering provider and patient info
      const orderInfo = await client.query(
        `SELECT lo.ordering_provider_id, lo.patient_id, p.first_name, p.last_name
         FROM lab_orders lo
         JOIN patients p ON p.id = lo.patient_id
         WHERE lo.id = $1`,
        [lab_order_id]
      );

      const { ordering_provider_id, patient_id, first_name, last_name } = orderInfo.rows[0];

      if (isCritical) {
        // Immediate notification to provider
        await this.notifyProviderCritical(ordering_provider_id, resultRecord.rows[0], {
          patient_id,
          patient_name: `${first_name} ${last_name}`
        });

        // Create escalation job (auto-escalate if not acknowledged in 15 min)
        await criticalValueQueue.add(
          {
            resultId: resultRecord.rows[0].id,
            providerId: ordering_provider_id,
            patientId: patient_id
          },
          { delay: 15 * 60 * 1000 } // 15 minutes
        );
      }

      await client.query('COMMIT');

      return resultRecord.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  evaluateResult(loincCode, value) {
    const rule = CRITICAL_VALUE_RULES[loincCode];
    if (!rule) {
      return { isCritical: false, isAbnormal: false };
    }

    const numValue = parseFloat(value);
    const isCritical =
      (rule.criticalLow && numValue < rule.criticalLow) ||
      (rule.criticalHigh && numValue > rule.criticalHigh);

    return {
      isCritical,
      isAbnormal: isCritical // Simplified; could have separate abnormal ranges
    };
  }

  async notifyProviderCritical(providerId, result, patientInfo) {
    const notification = {
      type: 'CRITICAL_LAB_VALUE',
      providerId,
      patientId: patientInfo.patient_id,
      patientName: patientInfo.patient_name,
      testName: result.test_name,
      value: result.value,
      units: result.units,
      timestamp: new Date()
    };

    // Send via multiple channels
    await Promise.all([
      this.sendWebSocketNotification(providerId, notification),
      this.sendSMSAlert(providerId, notification),
      this.sendEmailAlert(providerId, notification)
    ]);

    // Log notification
    await pool.query(
      `INSERT INTO critical_value_notifications
       (result_id, provider_id, notification_type, sent_at)
       VALUES ($1, $2, 'IMMEDIATE', NOW())`,
      [result.id, providerId]
    );
  }

  async sendWebSocketNotification(providerId, notification) {
    // Implementation: WebSocket push
    console.log('WebSocket notification:', notification);
  }

  async sendSMSAlert(providerId, notification) {
    // Implementation: Twilio SMS
    console.log('SMS alert:', notification);
  }

  async sendEmailAlert(providerId, notification) {
    // Implementation: Email via SendGrid/AWS SES
    console.log('Email alert:', notification);
  }
}

// Critical value escalation worker
criticalValueQueue.process(async (job) => {
  const { resultId, providerId, patientId } = job.data;

  // Check if result was acknowledged
  const ackCheck = await pool.query(
    `SELECT reviewed_by, reviewed_at FROM lab_results WHERE id = $1`,
    [resultId]
  );

  if (ackCheck.rows[0].reviewed_by) {
    return { acknowledged: true };
  }

  // Not acknowledged - escalate to supervisor/clinic admin
  await pool.query(
    `INSERT INTO critical_value_escalations
     (result_id, original_provider_id, escalation_reason, escalated_at)
     VALUES ($1, $2, 'NO_ACKNOWLEDGMENT_15MIN', NOW())`,
    [resultId, providerId]
  );

  // Notify clinic admin
  const adminResult = await pool.query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'Clinic Admin'
     LIMIT 1`
  );

  if (adminResult.rows.length > 0) {
    // Send escalation notification to admin
    console.log('Escalating to clinic admin:', adminResult.rows[0].id);
  }

  return { escalated: true };
});

module.exports = HandleLabResultUseCase;
```

### 4.3 Lab Results Review Interface

```jsx
// frontend/components/Labs/LabResultsReview.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';

const LabResultsReview = ({ providerId }) => {
  const [pendingResults, setPendingResults] = useState([]);
  const [criticalResults, setCriticalResults] = useState([]);

  useEffect(() => {
    loadPendingResults();
    const interval = setInterval(loadPendingResults, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [providerId]);

  const loadPendingResults = async () => {
    try {
      const [pending, critical] = await Promise.all([
        axios.get(`/api/lab-results/pending`, { params: { provider_id: providerId } }),
        axios.get(`/api/lab-results/critical`, { params: { provider_id: providerId } })
      ]);

      setPendingResults(pending.data);
      setCriticalResults(critical.data);
    } catch (error) {
      console.error('Error loading lab results:', error);
    }
  };

  const handleAcknowledge = async (resultId) => {
    try {
      await axios.post(`/api/lab-results/${resultId}/acknowledge`);
      loadPendingResults();
    } catch (error) {
      console.error('Error acknowledging result:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Critical Results Alert */}
      {criticalResults.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-center">
            <span className="text-3xl mr-3">🚨</span>
            <div className="flex-1">
              <h3 className="font-bold text-red-800 text-lg">
                {criticalResults.length} Critical Lab Result{criticalResults.length > 1 ? 's' : ''} Pending Review
              </h3>
              <p className="text-red-600 text-sm mt-1">Immediate action required</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {criticalResults.map(result => (
              <div key={result.id} className="bg-white p-3 rounded border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{result.patient_name}</p>
                    <p className="text-sm">
                      <span className="font-medium">{result.test_name}:</span>{' '}
                      <span className="text-red-700 font-bold">{result.value} {result.units}</span>
                      <span className="text-gray-500 ml-2">(Ref: {result.reference_range})</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(result.result_date), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAcknowledge(result.id)}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Acknowledge & Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Results */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Pending Lab Results</h3>
        </div>
        <div className="divide-y">
          {pendingResults.map(result => (
            <div key={result.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold">{result.patient_name}</p>
                  <p className="text-sm text-gray-600">
                    {result.test_name}: {result.value} {result.units}
                    {result.is_abnormal && (
                      <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                        Abnormal
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(result.result_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <button
                  onClick={() => handleAcknowledge(result.id)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Review
                </button>
              </div>
            </div>
          ))}

          {pendingResults.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No pending lab results
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabResultsReview;
```

---

## 5. Imaging Orders & PACS Integration

### 5.1 Imaging Order Creation

```javascript
// backend/useCases/CreateImagingOrderUseCase.js
const pool = require('../config/database');

class CreateImagingOrderUseCase {
  async execute(orderData, orderingProviderId) {
    const {
      encounter_id,
      patient_id,
      modality, // 'CT', 'MRI', 'X-RAY', 'ULTRASOUND'
      body_part,
      procedure_code,
      procedure_description,
      clinical_indication,
      priority,
      facility
    } = orderData;

    const result = await pool.query(
      `INSERT INTO imaging_orders
       (encounter_id, patient_id, ordering_provider_id, modality, body_part,
        procedure_code, procedure_description, clinical_indication, priority,
        facility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
       RETURNING *`,
      [
        encounter_id, patient_id, orderingProviderId, modality, body_part,
        procedure_code, procedure_description, clinical_indication, priority, facility
      ]
    );

    const imagingOrder = result.rows[0];

    // Send HL7 order to imaging facility (ORM message)
    await this.sendHL7Order(imagingOrder);

    // Check insurance authorization requirements
    await this.checkAuthorizationRequired(imagingOrder);

    return imagingOrder;
  }

  async sendHL7Order(order) {
    // Implementation: Send HL7 ORM message to imaging facility
    console.log('Sending imaging order via HL7:', order.id);
  }

  async checkAuthorizationRequired(order) {
    // Implementation: Check if prior auth needed based on payer rules
    const authRequired = ['MRI', 'CT', 'PET'].includes(order.modality);

    if (authRequired) {
      await pool.query(
        `UPDATE imaging_orders
         SET authorization_required = TRUE
         WHERE id = $1`,
        [order.id]
      );
    }
  }
}

module.exports = CreateImagingOrderUseCase;
```

### 5.2 PACS Integration & DICOM Viewer

```javascript
// backend/routes/imaging.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Get PACS study URL for viewing
 */
router.get('/:orderId/pacs-url', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Get imaging order
    const orderResult = await pool.query(
      `SELECT * FROM imaging_orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (!order.pacs_study_uid) {
      return res.status(404).json({ ok: false, error: 'DICOM study not available yet' });
    }

    // Generate PACS viewer URL (using DICOM Web or proprietary viewer)
    const pacsViewerUrl = `${process.env.PACS_VIEWER_URL}/study/${order.pacs_study_uid}`;

    res.json({
      ok: true,
      viewerUrl: pacsViewerUrl,
      studyUid: order.pacs_study_uid,
      modality: order.modality
    });
  } catch (error) {
    console.error('PACS URL error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Receive DICOM study notification from PACS
 */
router.post('/pacs-notification', async (req, res) => {
  try {
    const { order_id, study_uid, status, report_url } = req.body;

    // Update imaging order with DICOM study info
    await pool.query(
      `UPDATE imaging_orders
       SET pacs_study_uid = $1, status = $2, report_url = $3, completed_date = NOW()
       WHERE id = $4`,
      [study_uid, status, report_url, order_id]
    );

    // Notify ordering provider
    const orderInfo = await pool.query(
      `SELECT ordering_provider_id, patient_id FROM imaging_orders WHERE id = $1`,
      [order_id]
    );

    if (orderInfo.rows.length > 0) {
      // Send notification (WebSocket, email, etc.)
      console.log('Imaging study ready for provider:', orderInfo.rows[0].ordering_provider_id);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('PACS notification error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
```

### 5.3 Imaging Results Component

```jsx
// frontend/components/Imaging/ImagingViewer.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ImagingViewer = ({ orderId }) => {
  const [order, setOrder] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);

  useEffect(() => {
    loadImagingOrder();
  }, [orderId]);

  const loadImagingOrder = async () => {
    try {
      const response = await axios.get(`/api/imaging-orders/${orderId}`);
      setOrder(response.data);

      if (response.data.pacs_study_uid) {
        const urlResponse = await axios.get(`/api/imaging-orders/${orderId}/pacs-url`);
        setViewerUrl(urlResponse.data.viewerUrl);
      }
    } catch (error) {
      console.error('Error loading imaging order:', error);
    }
  };

  if (!order) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Order Details */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-lg mb-3">Imaging Order Details</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="font-medium">Modality:</span> {order.modality}</div>
          <div><span className="font-medium">Body Part:</span> {order.body_part}</div>
          <div><span className="font-medium">Status:</span> {order.status}</div>
          <div><span className="font-medium">Ordered:</span> {new Date(order.created_at).toLocaleDateString()}</div>
        </div>
        <div className="mt-3">
          <span className="font-medium">Clinical Indication:</span>
          <p className="text-sm text-gray-700 mt-1">{order.clinical_indication}</p>
        </div>
      </div>

      {/* DICOM Viewer */}
      {viewerUrl ? (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-lg mb-3">DICOM Viewer</h3>
          <iframe
            src={viewerUrl}
            className="w-full h-[600px] border rounded"
            title="DICOM Viewer"
          />
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-center">
          <p className="text-yellow-800">
            Images not yet available. Study status: {order.status}
          </p>
        </div>
      )}

      {/* Report */}
      {order.report_url && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-lg mb-3">Radiology Report</h3>
          <a
            href={order.report_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            View Report PDF →
          </a>
        </div>
      )}
    </div>
  );
};

export default ImagingViewer;
```

---

**(Continued in next message due to length...)**
