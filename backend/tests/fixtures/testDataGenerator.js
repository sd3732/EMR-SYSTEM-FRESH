// Test Data Generator for EMR System
// Generates realistic test data for patients, encounters, vitals, and lab results

import pool from '../../db/index.js';
import { faker } from '@faker-js/faker';

class TestDataGenerator {
  constructor() {
    this.genders = ['male', 'female', 'other'];
    this.ethnicities = ['hispanic', 'non-hispanic', 'unknown'];
    this.races = ['white', 'black', 'asian', 'native-american', 'pacific-islander', 'other'];
    this.insuranceTypes = ['commercial', 'medicare', 'medicaid', 'self-pay'];
    this.encounterTypes = ['office-visit', 'annual-physical', 'follow-up', 'urgent-care', 'telemedicine'];
    this.specialties = ['Internal Medicine', 'Family Medicine', 'Cardiology', 'Endocrinology', 'Neurology'];
  }

  generatePatients(count = 10) {
    return Array.from({ length: count }, () => {
      const gender = faker.helpers.arrayElement(this.genders);
      const firstName = faker.person.firstName(gender);
      const lastName = faker.person.lastName();
      const dob = faker.date.birthdate({ min: 18, max: 90, mode: 'age' });
      
      return {
        firstName,
        lastName,
        dob: dob.toISOString().split('T')[0],
        gender,
        ssn: faker.phone.number('###-##-####'),
        phone: faker.phone.number('###-###-####'),
        email: faker.internet.email({ firstName, lastName }),
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state({ abbreviated: true }),
          zipCode: faker.location.zipCode(),
          country: 'USA'
        },
        demographics: {
          ethnicity: faker.helpers.arrayElement(this.ethnicities),
          race: faker.helpers.arrayElement(this.races),
          language: 'English'
        },
        insurance: {
          type: faker.helpers.arrayElement(this.insuranceTypes),
          memberId: faker.string.alphanumeric(10),
          groupNumber: faker.string.alphanumeric(8),
          planName: faker.company.name() + ' Health Plan'
        },
        emergencyContact: {
          name: faker.person.fullName(),
          relationship: faker.helpers.arrayElement(['spouse', 'parent', 'child', 'sibling', 'friend']),
          phone: faker.phone.number('###-###-####')
        }
      };
    });
  }

  generateProviders(count = 5) {
    return Array.from({ length: count }, () => ({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      specialty: faker.helpers.arrayElement(this.specialties),
      npi: faker.string.numeric(10),
      role: faker.helpers.arrayElement(['physician', 'nurse-practitioner', 'physician-assistant']),
      licenseNumber: faker.string.alphanumeric(8),
      phone: faker.phone.number('###-###-####')
    }));
  }

  generateEncounters(patientId, count = 3) {
    const encounters = [];
    const now = new Date();
    
    for (let i = 0; i < count; i++) {
      const encounterDate = new Date(now.getTime() - (i * 30 * 24 * 60 * 60 * 1000)); // Monthly encounters
      
      encounters.push({
        patientId,
        encounterType: faker.helpers.arrayElement(this.encounterTypes),
        encounterDate: encounterDate.toISOString(),
        chiefComplaint: faker.helpers.arrayElement([
          'Annual physical examination',
          'Follow-up for hypertension',
          'Chest pain evaluation',
          'Diabetes management',
          'Medication review',
          'Preventive care visit'
        ]),
        status: 'completed',
        visitNotes: faker.lorem.paragraphs(2),
        assessmentAndPlan: faker.lorem.paragraph()
      });
    }
    
    return encounters;
  }

  generateVitals(encounterId, patientAge = 45) {
    const isAdult = patientAge >= 18;
    
    return {
      encounterId,
      height: isAdult ? 
        faker.number.int({ min: 150, max: 200 }) : // cm for adults
        faker.number.int({ min: 100, max: 180 }), // cm for children
      weight: isAdult ?
        faker.number.int({ min: 50, max: 120 }) : // kg for adults
        faker.number.int({ min: 20, max: 80 }), // kg for children
      bmi: null, // Will be calculated
      temperature: faker.number.float({ min: 36.0, max: 37.5, precision: 0.1 }),
      heartRate: faker.number.int({ min: 60, max: 100 }),
      systolicBp: faker.number.int({ min: 110, max: 140 }),
      diastolicBp: faker.number.int({ min: 70, max: 90 }),
      respiratoryRate: faker.number.int({ min: 12, max: 20 }),
      oxygenSaturation: faker.number.int({ min: 95, max: 100 }),
      painLevel: faker.number.int({ min: 0, max: 10 }),
      takenAt: new Date().toISOString(),
      takenBy: 'Test Staff'
    };
  }

  generateLabOrders(patientId, providerId, count = 2) {
    const commonTests = [
      { loincCode: '2951-2', testName: 'Glucose', specimenType: 'serum' },
      { loincCode: '2823-3', testName: 'Potassium', specimenType: 'serum' },
      { loincCode: '2075-0', testName: 'Chloride', specimenType: 'serum' },
      { loincCode: '2160-0', testName: 'Creatinine', specimenType: 'serum' },
      { loincCode: '33747-0', testName: 'Hemoglobin A1c', specimenType: 'blood' },
      { loincCode: '2339-0', testName: 'Glucose', specimenType: 'serum' },
      { loincCode: '789-8', testName: 'RBC count', specimenType: 'blood' },
      { loincCode: '6690-2', testName: 'WBC count', specimenType: 'blood' }
    ];

    return Array.from({ length: count }, () => {
      const selectedTests = faker.helpers.arrayElements(commonTests, faker.number.int({ min: 2, max: 5 }));
      
      return {
        patientId,
        providerId,
        encounterId: null,
        priority: faker.helpers.arrayElement(['routine', 'urgent', 'stat']),
        clinicalIndication: faker.helpers.arrayElement([
          'Annual physical examination',
          'Diabetes monitoring',
          'Hypertension follow-up',
          'Medication monitoring',
          'Symptom evaluation'
        ]),
        fastingRequired: faker.datatype.boolean(),
        tests: selectedTests
      };
    });
  }

  generateLabResults(orderId, testData) {
    const results = [];
    
    for (const test of testData) {
      const { loincCode, testName } = test;
      let numericValue, unit, referenceRange, abnormalFlag;
      
      // Generate realistic values based on test type
      switch (loincCode) {
        case '2951-2': // Glucose
          numericValue = faker.number.int({ min: 70, max: 200 });
          unit = 'mg/dL';
          referenceRange = '70-100';
          abnormalFlag = numericValue > 100 ? 'H' : (numericValue < 70 ? 'L' : 'N');
          break;
        case '2823-3': // Potassium
          numericValue = faker.number.float({ min: 3.0, max: 5.5, precision: 0.1 });
          unit = 'mEq/L';
          referenceRange = '3.5-5.0';
          abnormalFlag = numericValue > 5.0 ? 'H' : (numericValue < 3.5 ? 'L' : 'N');
          break;
        case '2160-0': // Creatinine
          numericValue = faker.number.float({ min: 0.6, max: 2.0, precision: 0.1 });
          unit = 'mg/dL';
          referenceRange = '0.7-1.3';
          abnormalFlag = numericValue > 1.3 ? 'H' : (numericValue < 0.7 ? 'L' : 'N');
          break;
        case '33747-0': // HbA1c
          numericValue = faker.number.float({ min: 4.5, max: 12.0, precision: 0.1 });
          unit = '%';
          referenceRange = '4.0-5.6';
          abnormalFlag = numericValue > 5.6 ? 'H' : 'N';
          break;
        default:
          numericValue = faker.number.float({ min: 10, max: 100, precision: 0.1 });
          unit = 'units';
          referenceRange = '20-80';
          abnormalFlag = 'N';
      }
      
      results.push({
        orderId,
        testName,
        loincCode,
        resultValue: numericValue.toString(),
        numericValue,
        unit,
        referenceRange,
        abnormalFlag,
        resultStatus: 'final',
        resultDate: new Date().toISOString(),
        interpretation: abnormalFlag === 'H' ? 'High' : (abnormalFlag === 'L' ? 'Low' : 'Normal'),
        isEncrypted: ['HIV', 'genetics', 'drug screen'].some(sensitive => 
          testName.toLowerCase().includes(sensitive.toLowerCase())
        )
      });
    }
    
    return results;
  }

  generateMedications(count = 20) {
    const medications = [
      { generic: 'lisinopril', brand: 'Prinivil', rxcui: '29046', class: 'ACE Inhibitor', controlled: false },
      { generic: 'metformin', brand: 'Glucophage', rxcui: '6809', class: 'Biguanide', controlled: false },
      { generic: 'amlodipine', brand: 'Norvasc', rxcui: '17767', class: 'Calcium Channel Blocker', controlled: false },
      { generic: 'simvastatin', brand: 'Zocor', rxcui: '36567', class: 'Statin', controlled: false },
      { generic: 'omeprazole', brand: 'Prilosec', rxcui: '7646', class: 'Proton Pump Inhibitor', controlled: false },
      { generic: 'warfarin', brand: 'Coumadin', rxcui: '11289', class: 'Anticoagulant', controlled: false },
      { generic: 'aspirin', brand: 'Bayer', rxcui: '1191', class: 'NSAID', controlled: false },
      { generic: 'morphine', brand: 'MS Contin', rxcui: '7052', class: 'Opioid', controlled: true },
      { generic: 'oxycodone', brand: 'OxyContin', rxcui: '7804', class: 'Opioid', controlled: true },
      { generic: 'alprazolam', brand: 'Xanax', rxcui: '596', class: 'Benzodiazepine', controlled: true }
    ];

    return medications.slice(0, Math.min(count, medications.length));
  }

  generateDrugInteractions() {
    return [
      {
        medication1: 'warfarin',
        medication2: 'aspirin',
        interactionType: 'pharmacodynamic',
        severityLevel: 5,
        description: 'Warfarin + Aspirin: Severe bleeding risk',
        clinicalEffect: 'Increased risk of major bleeding',
        management: 'Avoid combination or monitor INR closely',
        evidenceLevel: 'high'
      },
      {
        medication1: 'simvastatin',
        medication2: 'gemfibrozil',
        interactionType: 'pharmacokinetic',
        severityLevel: 4,
        description: 'Simvastatin + Gemfibrozil: Myopathy risk',
        clinicalEffect: 'Increased risk of rhabdomyolysis',
        management: 'Use alternative statin or reduce dose',
        evidenceLevel: 'high'
      }
    ];
  }

  async insertTestPatients(patients) {
    const insertedPatients = [];
    
    for (const patient of patients) {
      const result = await pool.query(`
        INSERT INTO patients (
          first_name, last_name, dob, gender, ssn, phone, email,
          address_line1, city, state, zip_code, country,
          ethnicity, race, primary_language,
          insurance_type, insurance_member_id, insurance_group_number, insurance_plan_name,
          emergency_contact_name, emergency_contact_relationship, emergency_contact_phone
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        ) RETURNING id
      `, [
        patient.firstName, patient.lastName, patient.dob, patient.gender,
        patient.ssn, patient.phone, patient.email,
        patient.address.street, patient.address.city, patient.address.state, 
        patient.address.zipCode, patient.address.country,
        patient.demographics.ethnicity, patient.demographics.race, patient.demographics.language,
        patient.insurance.type, patient.insurance.memberId, patient.insurance.groupNumber, patient.insurance.planName,
        patient.emergencyContact.name, patient.emergencyContact.relationship, patient.emergencyContact.phone
      ]);
      
      insertedPatients.push({
        id: result.rows[0].id,
        ...patient
      });
    }
    
    return insertedPatients;
  }

  async insertTestProviders(providers) {
    const insertedProviders = [];
    
    for (const provider of providers) {
      const result = await pool.query(`
        INSERT INTO providers (
          first_name, last_name, email, specialty, npi, role
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        provider.firstName, provider.lastName, provider.email,
        provider.specialty, provider.npi, provider.role
      ]);
      
      insertedProviders.push({
        id: result.rows[0].id,
        ...provider
      });
    }
    
    return insertedProviders;
  }

  async insertTestEncounters(patientId, encounters) {
    const insertedEncounters = [];
    
    for (const encounter of encounters) {
      const result = await pool.query(`
        INSERT INTO encounters (
          patient_id, encounter_type, encounter_date, chief_complaint, 
          status, visit_notes, assessment_and_plan
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        patientId, encounter.encounterType, encounter.encounterDate,
        encounter.chiefComplaint, encounter.status, encounter.visitNotes, encounter.assessmentAndPlan
      ]);
      
      insertedEncounters.push({
        id: result.rows[0].id,
        ...encounter
      });
    }
    
    return insertedEncounters;
  }

  async insertTestVitals(vitals) {
    const bmi = vitals.weight && vitals.height ? 
      Math.round((vitals.weight / Math.pow(vitals.height / 100, 2)) * 10) / 10 : null;
    
    const result = await pool.query(`
      INSERT INTO vitals (
        encounter_id, height_cm, weight_kg, bmi, temperature_celsius,
        heart_rate_bpm, systolic_bp, diastolic_bp, respiratory_rate_bpm,
        oxygen_saturation_percent, pain_level, taken_at, taken_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      vitals.encounterId, vitals.height, vitals.weight, bmi, vitals.temperature,
      vitals.heartRate, vitals.systolicBp, vitals.diastolicBp, vitals.respiratoryRate,
      vitals.oxygenSaturation, vitals.painLevel, vitals.takenAt, vitals.takenBy
    ]);
    
    return { id: result.rows[0].id, ...vitals, bmi };
  }

  async cleanupTestData() {
    const tables = [
      'lab_results', 'lab_tests', 'lab_orders', 'vitals', 'encounters', 
      'patients', 'providers', 'phi_access_logs', 'authentication_logs'
    ];
    
    for (const table of tables) {
      await pool.query(`DELETE FROM ${table} WHERE created_at > CURRENT_DATE - INTERVAL '1 day'`);
    }
  }

  async generateCompleteTestDataset() {
    console.log('🧪 Generating complete test dataset...');
    
    try {
      // Generate and insert providers
      const providers = this.generateProviders(3);
      const insertedProviders = await this.insertTestProviders(providers);
      console.log(`✅ Created ${insertedProviders.length} test providers`);
      
      // Generate and insert patients
      const patients = this.generatePatients(10);
      const insertedPatients = await this.insertTestPatients(patients);
      console.log(`✅ Created ${insertedPatients.length} test patients`);
      
      // Generate encounters and vitals for each patient
      let totalEncounters = 0;
      let totalVitals = 0;
      
      for (const patient of insertedPatients) {
        const encounters = this.generateEncounters(patient.id, 2);
        const insertedEncounters = await this.insertTestEncounters(patient.id, encounters);
        totalEncounters += insertedEncounters.length;
        
        for (const encounter of insertedEncounters) {
          const vitals = this.generateVitals(encounter.id);
          await this.insertTestVitals(vitals);
          totalVitals++;
        }
      }
      
      console.log(`✅ Created ${totalEncounters} test encounters`);
      console.log(`✅ Created ${totalVitals} test vital signs`);
      
      return {
        providers: insertedProviders,
        patients: insertedPatients,
        encountersCount: totalEncounters,
        vitalsCount: totalVitals
      };
      
    } catch (error) {
      console.error('❌ Error generating test dataset:', error);
      throw error;
    }
  }
}

export default TestDataGenerator;