# COMPLETE EMR BLUEPRINT - PART 4: INTEGRATIONS & INTEROPERABILITY

## Table of Contents
1. [HL7 v2 Lab Interfaces](#1-hl7-v2-lab-interfaces)
2. [FHIR R4 API Implementation](#2-fhir-r4-api-implementation)
3. [PACS/DICOM Integration](#3-pacsdicom-integration)
4. [e-Prescribing (SureScripts)](#4-e-prescribing-surescripts)
5. [Insurance Eligibility APIs](#5-insurance-eligibility-apis)
6. [CDA Document Exchange](#6-cda-document-exchange)

---

## 1. HL7 v2 Lab Interfaces

### 1.1 HL7 Message Parser

```javascript
// backend/services/HL7Parser.js
class HL7Parser {
  parse(hl7Message) {
    const segments = hl7Message.split('\n').map(s => s.trim()).filter(s => s);
    const parsed = {
      messageType: null,
      segments: []
    };

    for (const segment of segments) {
      const fields = segment.split('|');
      const segmentType = fields[0];

      parsed.segments.push({
        type: segmentType,
        fields
      });

      // Get message type from MSH segment
      if (segmentType === 'MSH' && !parsed.messageType) {
        parsed.messageType = fields[8]; // MSH-9 Message Type
      }
    }

    return parsed;
  }

  /**
   * Parse ORU^R01 (Lab Results)
   */
  parseLabResult(hl7Message) {
    const parsed = this.parse(hl7Message);
    const result = {
      patient: {},
      order: {},
      observations: []
    };

    for (const segment of parsed.segments) {
      switch (segment.type) {
        case 'PID': // Patient Identification
          result.patient = {
            id: segment.fields[3],
            name: segment.fields[5],
            dob: this.parseDate(segment.fields[7]),
            gender: segment.fields[8]
          };
          break;

        case 'OBR': // Observation Request
          result.order = {
            orderNumber: segment.fields[2],
            testName: segment.fields[4],
            observationDateTime: this.parseDateTime(segment.fields[7])
          };
          break;

        case 'OBX': // Observation Result
          result.observations.push({
            valueType: segment.fields[2],
            identifier: segment.fields[3],
            value: segment.fields[5],
            units: segment.fields[6],
            referenceRange: segment.fields[7],
            abnormalFlags: segment.fields[8],
            observationDateTime: this.parseDateTime(segment.fields[14])
          });
          break;
      }
    }

    return result;
  }

  parseDate(hl7Date) {
    if (!hl7Date || hl7Date.length < 8) return null;
    const year = hl7Date.slice(0, 4);
    const month = hl7Date.slice(4, 6);
    const day = hl7Date.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  parseDateTime(hl7DateTime) {
    if (!hl7DateTime) return null;
    const date = this.parseDate(hl7DateTime);
    if (hl7DateTime.length >= 12) {
      const hour = hl7DateTime.slice(8, 10);
      const minute = hl7DateTime.slice(10, 12);
      return `${date} ${hour}:${minute}`;
    }
    return date;
  }
}

module.exports = HL7Parser;
```

### 1.2 HL7 Result Processing

```javascript
// backend/services/HL7ResultProcessor.js
const pool = require('../config/database');
const HL7Parser = require('./HL7Parser');

class HL7ResultProcessor {
  async processLabResult(hl7Message) {
    const parser = new HL7Parser();
    const labResult = parser.parseLabResult(hl7Message);

    // Find matching lab order
    const orderResult = await pool.query(
      `SELECT * FROM lab_orders WHERE id = $1::INTEGER`,
      [labResult.order.orderNumber]
    );

    if (orderResult.rows.length === 0) {
      throw new Error(`Lab order ${labResult.order.orderNumber} not found`);
    }

    const labOrder = orderResult.rows[0];

    // Save observations as lab results
    for (const obs of labResult.observations) {
      await pool.query(
        `INSERT INTO lab_results
         (lab_order_id, loinc_code, test_name, value, units, reference_range,
          is_abnormal, result_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          labOrder.id,
          obs.identifier,
          labResult.order.testName,
          obs.value,
          obs.units,
          obs.referenceRange,
          obs.abnormalFlags ? true : false,
          labResult.order.observationDateTime
        ]
      );
    }

    // Update lab order status
    await pool.query(
      `UPDATE lab_orders SET status = 'completed' WHERE id = $1`,
      [labOrder.id]
    );

    return { ok: true, orderNumber: labResult.order.orderNumber };
  }
}

module.exports = HL7ResultProcessor;
```

---

## 2. FHIR R4 API Implementation

### 2.1 FHIR Patient Resource

```javascript
// backend/routes/fhir/patient.js
const express = require('express');
const router = express.Router();
const pool = require('../../config/database');

/**
 * GET /fhir/Patient/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM patients WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-found',
          diagnostics: `Patient ${id} not found`
        }]
      });
    }

    const patient = result.rows[0];

    // Transform to FHIR Patient resource
    const fhirPatient = {
      resourceType: 'Patient',
      id: patient.id.toString(),
      identifier: [{
        system: 'http://clinic.example.com/mrn',
        value: patient.mrn
      }],
      name: [{
        use: 'official',
        family: patient.last_name,
        given: [patient.first_name, patient.middle_name].filter(n => n)
      }],
      gender: patient.gender?.toLowerCase(),
      birthDate: patient.date_of_birth,
      address: [{
        use: 'home',
        line: [patient.address_line1, patient.address_line2].filter(a => a),
        city: patient.city,
        state: patient.state,
        postalCode: patient.zip_code
      }],
      telecom: [
        { system: 'phone', value: patient.phone_primary, use: 'home' },
        { system: 'email', value: patient.email }
      ].filter(t => t.value),
      active: patient.is_active
    };

    res.json(fhirPatient);
  } catch (error) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Patient (search)
 */
router.get('/', async (req, res) => {
  try {
    const { family, given, birthdate, identifier } = req.query;

    let query = 'SELECT * FROM patients WHERE 1=1';
    const params = [];

    if (family) {
      params.push(`%${family}%`);
      query += ` AND last_name ILIKE $${params.length}`;
    }

    if (given) {
      params.push(`%${given}%`);
      query += ` AND first_name ILIKE $${params.length}`;
    }

    if (birthdate) {
      params.push(birthdate);
      query += ` AND date_of_birth = $${params.length}`;
    }

    if (identifier) {
      params.push(identifier);
      query += ` AND mrn = $${params.length}`;
    }

    const result = await pool.query(query, params);

    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: result.rows.length,
      entry: result.rows.map(patient => ({
        resource: {
          resourceType: 'Patient',
          id: patient.id.toString(),
          name: [{ family: patient.last_name, given: [patient.first_name] }],
          birthDate: patient.date_of_birth
        }
      }))
    };

    res.json(bundle);
  } catch (error) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', diagnostics: error.message }]
    });
  }
});

module.exports = router;
```

### 2.2 FHIR Observation Resource (Vitals)

```javascript
// backend/routes/fhir/observation.js
const express = require('express');
const router = express.Router();
const pool = require('../../config/database');

router.get('/', async (req, res) => {
  try {
    const { patient, category } = req.query;

    if (!patient) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', diagnostics: 'Patient parameter required' }]
      });
    }

    const result = await pool.query(
      `SELECT * FROM vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [patient]
    );

    const observations = [];

    for (const vital of result.rows) {
      // Blood Pressure
      if (vital.bp_systolic && vital.bp_diastolic) {
        observations.push({
          resourceType: 'Observation',
          id: `bp-${vital.id}`,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }] },
          subject: { reference: `Patient/${patient}` },
          effectiveDateTime: vital.recorded_at,
          component: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic' }] },
              valueQuantity: { value: vital.bp_systolic, unit: 'mmHg' }
            },
            {
              code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic' }] },
              valueQuantity: { value: vital.bp_diastolic, unit: 'mmHg' }
            }
          ]
        });
      }

      // Weight
      if (vital.weight_lbs) {
        observations.push({
          resourceType: 'Observation',
          id: `weight-${vital.id}`,
          status: 'final',
          category: [{ coding: [{ code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }] },
          subject: { reference: `Patient/${patient}` },
          effectiveDateTime: vital.recorded_at,
          valueQuantity: { value: vital.weight_lbs, unit: 'lbs' }
        });
      }
    }

    res.json({
      resourceType: 'Bundle',
      type: 'searchset',
      total: observations.length,
      entry: observations.map(obs => ({ resource: obs }))
    });
  } catch (error) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', diagnostics: error.message }]
    });
  }
});

module.exports = router;
```

---

## 3. PACS/DICOM Integration

### 3.1 DICOM Query/Retrieve (C-FIND)

```javascript
// backend/services/DICOMService.js
const axios = require('axios');

class DICOMService {
  constructor() {
    this.pacsUrl = process.env.PACS_DICOM_WEB_URL;
  }

  /**
   * Query PACS for studies (QIDO-RS)
   */
  async queryStudies(patientId) {
    try {
      const response = await axios.get(`${this.pacsUrl}/studies`, {
        params: {
          PatientID: patientId,
          limit: 100
        },
        headers: {
          'Accept': 'application/dicom+json'
        }
      });

      return response.data.map(study => ({
        studyInstanceUID: study['0020000D']?.Value[0],
        studyDate: study['00080020']?.Value[0],
        studyDescription: study['00081030']?.Value[0],
        modality: study['00080061']?.Value[0],
        accessionNumber: study['00080050']?.Value[0]
      }));
    } catch (error) {
      throw new Error(`PACS query error: ${error.message}`);
    }
  }

  /**
   * Retrieve DICOM study URL for viewer (WADO-RS)
   */
  async getStudyViewerURL(studyInstanceUID) {
    return `${process.env.PACS_VIEWER_URL}/viewer?studyUID=${studyInstanceUID}`;
  }

  /**
   * Send DICOM study (STOW-RS)
   */
  async storeStudy(dicomFiles) {
    const formData = new FormData();

    for (const file of dicomFiles) {
      formData.append('file', file, {
        contentType: 'application/dicom',
        filename: file.name
      });
    }

    try {
      const response = await axios.post(`${this.pacsUrl}/studies`, formData, {
        headers: {
          'Content-Type': 'multipart/related; type="application/dicom"'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`DICOM store error: ${error.message}`);
    }
  }
}

module.exports = DICOMService;
```

---

## 4. e-Prescribing (SureScripts)

### 4.1 NCPDP SCRIPT Implementation

```javascript
// backend/services/EPrescribingService.js
const axios = require('axios');

class EPrescribingService {
  /**
   * Send new prescription via SureScripts
   */
  async sendNewRx(prescription) {
    const ncpdpMessage = this.buildNCPDPMessage(prescription);

    try {
      const response = await axios.post(
        process.env.SURESCRIPTS_API_URL + '/NewRx',
        ncpdpMessage,
        {
          headers: {
            'Content-Type': 'application/xml',
            'Authorization': `Bearer ${process.env.SURESCRIPTS_API_KEY}`
          }
        }
      );

      // Update prescription with SureScripts message ID
      await pool.query(
        `UPDATE prescriptions SET erx_message_id = $1, status = 'sent' WHERE id = $2`,
        [response.data.MessageID, prescription.id]
      );

      return { ok: true, messageId: response.data.MessageID };
    } catch (error) {
      throw new Error(`e-Prescribing error: ${error.message}`);
    }
  }

  buildNCPDPMessage(prescription) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Message>
  <Header>
    <To>${prescription.pharmacy_ncpdp}</To>
    <From>${process.env.CLINIC_NCPDP}</From>
    <MessageID>${prescription.id}</MessageID>
    <SentTime>${new Date().toISOString()}</SentTime>
  </Header>
  <Body>
    <NewRx>
      <Patient>
        <Name>
          <LastName>${prescription.patient_last_name}</LastName>
          <FirstName>${prescription.patient_first_name}</FirstName>
        </Name>
        <DateOfBirth>${prescription.patient_dob}</DateOfBirth>
        <Gender>${prescription.patient_gender}</Gender>
      </Patient>
      <Prescriber>
        <NPI>${prescription.prescriber_npi}</NPI>
        <DEA>${prescription.prescriber_dea}</DEA>
      </Prescriber>
      <Medication>
        <DrugDescription>${prescription.medication_name}</DrugDescription>
        <NDC>${prescription.ndc_code}</NDC>
        <Quantity>${prescription.quantity}</Quantity>
        <DaysSupply>${prescription.days_supply}</DaysSupply>
        <Refills>${prescription.refills}</Refills>
        <Directions>${prescription.instructions}</Directions>
      </Medication>
    </NewRx>
  </Body>
</Message>`;
  }

  /**
   * Process refill request from pharmacy
   */
  async processRefillRequest(ncpdpMessage) {
    // Parse NCPDP message
    // Find original prescription
    // Create refill prescription
    // Send RefillResponse
  }
}

module.exports = EPrescribingService;
```

---

## 5. Insurance Eligibility APIs

### 5.1 EDI 270/271 Eligibility Check

```javascript
// backend/services/EligibilityService.js
class EligibilityService {
  /**
   * Check insurance eligibility (270 request)
   */
  async checkEligibility(patientId, insuranceId) {
    const patient = await this.getPatientInfo(patientId);
    const insurance = await this.getInsuranceInfo(insuranceId);

    const edi270 = this.build270Request(patient, insurance);

    // Send to clearinghouse
    const response = await axios.post(
      process.env.CLEARINGHOUSE_API_URL + '/eligibility',
      { edi_content: edi270 },
      { headers: { 'Authorization': `Bearer ${process.env.CLEARINGHOUSE_API_KEY}` } }
    );

    // Parse 271 response
    const eligibility = this.parse271Response(response.data.edi_271);

    return eligibility;
  }

  build270Request(patient, insurance) {
    return `ISA*00*          *00*          *ZZ*SUBMITTER_ID   *ZZ*RECEIVER_ID    *${this.getDate()}*${this.getTime()}*^*00501*000000001*0*P*:~
GS*HS*SENDER*RECEIVER*${this.getDate()}*${this.getTime()}*1*X*005010X279A1~
ST*270*0001*005010X279A1~
BHT*0022*13*${this.getReferenceNumber()}*${this.getDateTime()}*${this.getDateTime()}~
HL*1**20*1~
NM1*PR*2*${insurance.payer_name}*****PI*${insurance.payer_id}~
HL*2*1*21*1~
NM1*1P*2*${patient.clinic_name}*****XX*${patient.clinic_npi}~
HL*3*2*22*0~
TRN*1*${this.getReferenceNumber()}*${patient.clinic_npi}~
NM1*IL*1*${patient.last_name}*${patient.first_name}****MI*${insurance.member_id}~
DMG*D8*${patient.date_of_birth}~
DTP*291*D8*${this.getDate()}~
EQ*30~
SE*12*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  parse271Response(edi271) {
    const lines = edi271.split('~');
    const eligibility = {
      status: 'Unknown',
      coverageLevel: null,
      deductible: null,
      copay: null,
      effectiveDate: null
    };

    for (const line of lines) {
      const segments = line.split('*');

      if (segments[0] === 'EB') {
        eligibility.status = segments[1] === '1' ? 'Active' : 'Inactive';
        eligibility.coverageLevel = segments[2];
      }

      if (segments[0] === 'AMT') {
        if (segments[1] === 'D') {
          eligibility.deductible = parseFloat(segments[2]);
        } else if (segments[1] === 'B') {
          eligibility.copay = parseFloat(segments[2]);
        }
      }

      if (segments[0] === 'DTP' && segments[1] === '346') {
        eligibility.effectiveDate = segments[3];
      }
    }

    return eligibility;
  }
}

module.exports = EligibilityService;
```

---

## 6. CDA Document Exchange

### 6.1 C-CDA Generation

```javascript
// backend/services/CDAGenerator.js
class CDAGenerator {
  /**
   * Generate C-CDA Continuity of Care Document (CCD)
   */
  async generateCCD(encounterId) {
    const encounter = await this.getEncounterData(encounterId);

    const cda = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2"/>
  <id root="${encounter.document_id}"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <title>Continuity of Care Document</title>
  <effectiveTime value="${this.formatCDADate(encounter.encounter_date)}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>

  <!-- Patient -->
  <recordTarget>
    <patientRole>
      <id extension="${encounter.patient_mrn}" root="2.16.840.1.113883.3.example"/>
      <addr use="HP">
        <streetAddressLine>${encounter.patient_address}</streetAddressLine>
        <city>${encounter.patient_city}</city>
        <state>${encounter.patient_state}</state>
        <postalCode>${encounter.patient_zip}</postalCode>
      </addr>
      <patient>
        <name>
          <given>${encounter.patient_first_name}</given>
          <family>${encounter.patient_last_name}</family>
        </name>
        <administrativeGenderCode code="${encounter.patient_gender}" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="${this.formatCDADate(encounter.patient_dob)}"/>
      </patient>
    </patientRole>
  </recordTarget>

  <!-- Provider -->
  <author>
    <time value="${this.formatCDADate(encounter.encounter_date)}"/>
    <assignedAuthor>
      <id extension="${encounter.provider_npi}" root="2.16.840.1.113883.4.6"/>
      <assignedPerson>
        <name>
          <given>${encounter.provider_first_name}</given>
          <family>${encounter.provider_last_name}</family>
        </name>
      </assignedPerson>
    </assignedAuthor>
  </author>

  <!-- Problem List -->
  <component>
    <section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
      <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem List"/>
      <title>Problems</title>
      <text>
        <table>
          <thead><tr><th>Problem</th><th>Status</th></tr></thead>
          <tbody>
            ${encounter.diagnoses.map(dx => `
            <tr>
              <td>${dx.description}</td>
              <td>Active</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </text>
      ${encounter.diagnoses.map(dx => this.generateProblemEntry(dx)).join('')}
    </section>
  </component>

  <!-- Medications -->
  <component>
    <section>
      <templateId root="2.16.840.1.113883.10.20.22.2.1.1"/>
      <code code="10160-0" codeSystem="2.16.840.1.113883.6.1" displayName="Medications"/>
      <title>Medications</title>
      <text>
        <table>
          <thead><tr><th>Medication</th><th>Instructions</th></tr></thead>
          <tbody>
            ${encounter.medications.map(med => `
            <tr>
              <td>${med.medication_name}</td>
              <td>${med.instructions}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </text>
    </section>
  </component>

</ClinicalDocument>`;

    return cda;
  }

  formatCDADate(date) {
    return date.replace(/-/g, '').replace(/:/g, '').replace(' ', '');
  }

  generateProblemEntry(diagnosis) {
    return `
    <entry>
      <act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3"/>
        <id root="${diagnosis.id}"/>
        <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
        <statusCode code="active"/>
        <effectiveTime>
          <low value="${this.formatCDADate(diagnosis.onset_date)}"/>
        </effectiveTime>
        <entryRelationship typeCode="SUBJ">
          <observation classCode="OBS" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
            <id root="${diagnosis.id}"/>
            <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
            <statusCode code="completed"/>
            <value xsi:type="CD" code="${diagnosis.icd10_code}"
                   codeSystem="2.16.840.1.113883.6.90"
                   displayName="${diagnosis.description}"/>
          </observation>
        </entryRelationship>
      </act>
    </entry>`;
  }
}

module.exports = CDAGenerator;
```

---

**Part 4 Complete**. This covers all major interoperability standards and integration points for the EMR system.
