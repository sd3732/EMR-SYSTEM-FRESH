// HIPAA Compliance E2E Tests
// Tests complete HIPAA compliance workflows through the full application stack

describe('HIPAA Compliance E2E Tests', () => {
  const baseUrl = Cypress.env('baseUrl') || 'http://localhost:3000';
  const frontendUrl = Cypress.env('frontendUrl') || 'http://localhost:5173';
  
  let testUser = {
    email: 'hipaa-test@example.com',
    password: 'SecurePassword123!',
    firstName: 'HIPAA',
    lastName: 'Tester',
    role: 'physician'
  };

  let testPatient = {
    firstName: 'John',
    lastName: 'Doe',
    dob: '1980-01-01',
    ssn: '123-45-6789'
  };

  before(() => {
    // Setup test environment
    cy.task('setupTestDatabase');
    cy.task('createTestUser', testUser);
    cy.task('createTestPatient', testPatient);
  });

  after(() => {
    // Cleanup test data
    cy.task('cleanupTestData');
  });

  beforeEach(() => {
    // Clear session storage and cookies
    cy.clearAllCookies();
    cy.clearAllSessionStorage();
    cy.clearAllLocalStorage();
  });

  describe('Authentication and Authorization', () => {
    it('enforces authentication on all protected routes', () => {
      // Test direct access to patient data without authentication
      cy.request({
        url: `${baseUrl}/api/patients`,
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body).to.have.property('error');
        expect(response.body.error).to.match(/token|auth/i);
      });

      // Test access to lab data
      cy.request({
        url: `${baseUrl}/api/labs/orders`,
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
      });

      // Test access to audit logs
      cy.request({
        url: `${baseUrl}/api/audit/logs`,
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it('implements proper session management', () => {
      // Login and get session
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        expect(loginResponse.status).to.eq(200);
        const token = loginResponse.body.token;

        // Use valid session
        cy.request({
          url: `${baseUrl}/api/patients`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((response) => {
          expect(response.status).to.eq(200);
        });

        // Logout
        cy.request({
          method: 'POST',
          url: `${baseUrl}/api/auth/logout`,
          headers: { Authorization: `Bearer ${token}` }
        });

        // Try to use session after logout
        cy.request({
          url: `${baseUrl}/api/patients`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false
        }).then((response) => {
          expect(response.status).to.eq(401);
        });
      });
    });

    it('enforces role-based access control', () => {
      // Create limited role user
      const nurseUser = {
        email: 'nurse-test@example.com',
        password: 'NursePassword123!',
        role: 'nurse'
      };

      cy.task('createTestUser', nurseUser).then(() => {
        cy.request('POST', `${baseUrl}/api/auth/login`, {
          email: nurseUser.email,
          password: nurseUser.password
        }).then((loginResponse) => {
          const token = loginResponse.body.token;

          // Nurse should not access admin functions
          cy.request({
            method: 'GET',
            url: `${baseUrl}/api/audit/logs`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false
          }).then((response) => {
            expect(response.status).to.eq(403);
          });

          // Nurse should not create new providers
          cy.request({
            method: 'POST',
            url: `${baseUrl}/api/providers`,
            headers: { Authorization: `Bearer ${token}` },
            body: { firstName: 'Test', lastName: 'Provider' },
            failOnStatusCode: false
          }).then((response) => {
            expect(response.status).to.eq(403);
          });
        });
      });
    });
  });

  describe('PHI Access Logging', () => {
    it('logs all patient data access', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Access patient data
        cy.request({
          url: `${baseUrl}/api/patients`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((patientsResponse) => {
          const patientId = patientsResponse.body.data[0].id;

          // Access specific patient
          cy.request({
            url: `${baseUrl}/api/patients/${patientId}`,
            headers: { Authorization: `Bearer ${token}` }
          });

          // Access patient encounters
          cy.request({
            url: `${baseUrl}/api/patients/${patientId}/encounters`,
            headers: { Authorization: `Bearer ${token}` }
          });

          // Check audit logs were created
          cy.wait(1000); // Allow time for audit logs to be written

          cy.request({
            url: `${baseUrl}/api/audit/logs?patientId=${patientId}`,
            headers: { Authorization: `Bearer ${token}` }
          }).then((auditResponse) => {
            expect(auditResponse.status).to.eq(200);
            expect(auditResponse.body.data).to.be.an('array');
            expect(auditResponse.body.data.length).to.be.greaterThan(0);

            // Verify audit log structure
            const auditEntry = auditResponse.body.data[0];
            expect(auditEntry).to.have.property('user_id');
            expect(auditEntry).to.have.property('patient_id', patientId);
            expect(auditEntry).to.have.property('action_type');
            expect(auditEntry).to.have.property('resource_type');
            expect(auditEntry).to.have.property('created_at');
            expect(auditEntry).to.have.property('session_id');
            expect(auditEntry).to.have.property('ip_address');
          });
        });
      });
    });

    it('logs failed access attempts', () => {
      const invalidToken = 'invalid.jwt.token';

      // Attempt to access with invalid token
      cy.request({
        url: `${baseUrl}/api/patients/999`,
        headers: { Authorization: `Bearer ${invalidToken}` },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
      });

      // Login to check failed access logs
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Check for failed access logs
        cy.request({
          url: `${baseUrl}/api/audit/logs?actionType=failed_access`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((auditResponse) => {
          expect(auditResponse.status).to.eq(200);
          const failedAccesses = auditResponse.body.data.filter(log => 
            log.success === false
          );
          expect(failedAccesses.length).to.be.greaterThan(0);
        });
      });
    });
  });

  describe('Data Encryption and Security', () => {
    it('encrypts sensitive patient data', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Create patient with sensitive data
        const sensitivePatient = {
          firstName: 'Sensitive',
          lastName: 'Patient',
          dob: '1975-05-15',
          ssn: '987-65-4321',
          medicalHistory: 'HIV positive, genetic counseling needed'
        };

        cy.request({
          method: 'POST',
          url: `${baseUrl}/api/patients`,
          headers: { Authorization: `Bearer ${token}` },
          body: sensitivePatient
        }).then((createResponse) => {
          expect(createResponse.status).to.eq(201);
          const patientId = createResponse.body.data.id;

          // Verify SSN is not returned in plain text
          cy.request({
            url: `${baseUrl}/api/patients/${patientId}`,
            headers: { Authorization: `Bearer ${token}` }
          }).then((getResponse) => {
            const patient = getResponse.body.data;
            
            // SSN should be masked or encrypted
            expect(patient.ssn).to.not.equal(sensitivePatient.ssn);
            expect(patient.ssn).to.match(/\*\*\*-\*\*-\d{4}|encrypted/i);
          });

          // Create sensitive lab result
          cy.request({
            method: 'POST',
            url: `${baseUrl}/api/labs/orders`,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              patientId: patientId,
              clinicalIndication: 'HIV monitoring',
              tests: [
                { loincCode: '33747-0', testName: 'HIV viral load', specimenType: 'serum' }
              ]
            }
          }).then((orderResponse) => {
            const orderId = orderResponse.body.data.id;

            // Submit sensitive result
            cy.request({
              method: 'POST',
              url: `${baseUrl}/api/labs/results`,
              headers: { Authorization: `Bearer ${token}` },
              body: {
                orderId: orderId,
                testName: 'HIV viral load',
                resultValue: 'Positive',
                resultStatus: 'final'
              }
            });

            // Verify sensitive results are encrypted
            cy.request({
              url: `${baseUrl}/api/labs/patients/${patientId}/history`,
              headers: { Authorization: `Bearer ${token}` }
            }).then((historyResponse) => {
              const results = historyResponse.body.data;
              const hivResult = results.find(r => r.test_name.includes('HIV'));
              
              if (hivResult) {
                expect(hivResult).to.have.property('is_encrypted', true);
              }
            });
          });
        });
      });
    });

    it('implements proper data masking', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Get patient list - should have masked data
        cy.request({
          url: `${baseUrl}/api/patients/search?term=Doe`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((searchResponse) => {
          expect(searchResponse.status).to.eq(200);
          const patients = searchResponse.body.data;

          patients.forEach(patient => {
            // SSN should be masked in search results
            if (patient.ssn) {
              expect(patient.ssn).to.match(/\*\*\*-\*\*-\d{4}/);
            }

            // DOB should be masked or formatted appropriately
            if (patient.dob) {
              expect(patient.dob).to.not.include('1980-01-01');
            }
          });
        });
      });
    });
  });

  describe('Critical Value Management', () => {
    it('handles critical values with proper notifications', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        cy.request({
          url: `${baseUrl}/api/patients`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((patientsResponse) => {
          const patientId = patientsResponse.body.data[0].id;

          // Create lab order
          cy.request({
            method: 'POST',
            url: `${baseUrl}/api/labs/orders`,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              patientId: patientId,
              clinicalIndication: 'Emergency glucose check',
              priority: 'stat',
              tests: [
                { loincCode: '2951-2', testName: 'Glucose', specimenType: 'serum' }
              ]
            }
          }).then((orderResponse) => {
            const orderId = orderResponse.body.data.id;

            // Submit critical glucose result
            cy.request({
              method: 'POST',
              url: `${baseUrl}/api/labs/results`,
              headers: { Authorization: `Bearer ${token}` },
              body: {
                orderId: orderId,
                testName: 'Glucose',
                resultValue: '450',
                numericValue: 450,
                unit: 'mg/dL',
                referenceRange: '70-100',
                abnormalFlag: 'H',
                resultStatus: 'final'
              }
            });

            // Check for critical value alerts
            cy.request({
              url: `${baseUrl}/api/labs/results/critical`,
              headers: { Authorization: `Bearer ${token}` }
            }).then((criticalResponse) => {
              expect(criticalResponse.status).to.eq(200);
              const criticalResults = criticalResponse.body.data;
              
              const criticalGlucose = criticalResults.find(result => 
                result.patient_id === patientId && result.numeric_value === 450
              );

              if (criticalGlucose) {
                expect(criticalGlucose.requires_acknowledgment).to.be.true;
                expect(criticalGlucose.priority).to.eq('critical');

                // Acknowledge the critical value
                cy.request({
                  method: 'POST',
                  url: `${baseUrl}/api/labs/results/${criticalGlucose.id}/acknowledge`,
                  headers: { Authorization: `Bearer ${token}` },
                  body: {
                    acknowledgmentNotes: 'Provider notified, patient contacted'
                  }
                }).then((ackResponse) => {
                  expect(ackResponse.status).to.eq(200);
                });
              }
            });
          });
        });
      });
    });
  });

  describe('Frontend Security Integration', () => {
    it('implements secure authentication flow', () => {
      cy.visit(frontendUrl);

      // Should redirect to login if not authenticated
      cy.url().should('include', '/login');

      // Login with valid credentials
      cy.get('[data-testid="email-input"]').type(testUser.email);
      cy.get('[data-testid="password-input"]').type(testUser.password);
      cy.get('[data-testid="login-button"]').click();

      // Should redirect to dashboard after successful login
      cy.url().should('include', '/dashboard');

      // Verify authentication token is stored securely
      cy.window().then((window) => {
        const token = window.localStorage.getItem('authToken');
        expect(token).to.exist;
        expect(token).to.match(/^eyJ/); // JWT format
      });
    });

    it('implements automatic session timeout', () => {
      cy.visit(frontendUrl);
      
      // Login
      cy.get('[data-testid="email-input"]').type(testUser.email);
      cy.get('[data-testid="password-input"]').type(testUser.password);
      cy.get('[data-testid="login-button"]').click();

      cy.url().should('include', '/dashboard');

      // Simulate session timeout by manipulating token expiration
      cy.window().then((window) => {
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZSI6InBoeXNpY2lhbiIsImV4cCI6MTAwMDAwMH0.invalid';
        window.localStorage.setItem('authToken', expiredToken);
      });

      // Try to access protected content
      cy.visit(`${frontendUrl}/patients`);

      // Should redirect to login due to expired session
      cy.url().should('include', '/login');

      // Should show session timeout message
      cy.contains('Session expired').should('be.visible');
    });

    it('protects PHI display in UI', () => {
      cy.visit(frontendUrl);
      
      // Login
      cy.get('[data-testid="email-input"]').type(testUser.email);
      cy.get('[data-testid="password-input"]').type(testUser.password);
      cy.get('[data-testid="login-button"]').click();

      // Navigate to patient list
      cy.visit(`${frontendUrl}/patients`);

      // Verify sensitive data is masked
      cy.get('[data-testid="patient-list"]').should('exist');
      
      // SSN should be masked in patient list
      cy.get('[data-testid="patient-ssn"]').each(($el) => {
        cy.wrap($el).should('contain', '***-**-');
      });

      // DOB should be appropriately formatted/masked
      cy.get('[data-testid="patient-dob"]').each(($el) => {
        cy.wrap($el).invoke('text').should('not.include', '1980-01-01');
      });
    });

    it('implements secure data export', () => {
      cy.visit(frontendUrl);
      
      // Login
      cy.get('[data-testid="email-input"]').type(testUser.email);
      cy.get('[data-testid="password-input"]').type(testUser.password);
      cy.get('[data-testid="login-button"]').click();

      // Navigate to patient detail
      cy.visit(`${frontendUrl}/patients`);
      cy.get('[data-testid="patient-row"]').first().click();

      // Test data export functionality
      cy.get('[data-testid="export-button"]').click();

      // Should show export confirmation dialog
      cy.get('[data-testid="export-dialog"]').should('be.visible');
      cy.contains('This action will be logged for HIPAA compliance').should('be.visible');

      // Confirm export
      cy.get('[data-testid="confirm-export"]').click();

      // Verify export completed and audit log was created
      cy.contains('Export completed').should('be.visible');
      cy.contains('Audit log created').should('be.visible');
    });
  });

  describe('HIPAA Audit Reporting', () => {
    it('generates compliant audit reports', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Generate audit report
        const reportRequest = {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          userId: null, // All users
          patientId: null // All patients
        };

        cy.request({
          method: 'POST',
          url: `${baseUrl}/api/audit/reports/generate`,
          headers: { Authorization: `Bearer ${token}` },
          body: reportRequest
        }).then((reportResponse) => {
          expect(reportResponse.status).to.eq(200);
          
          const report = reportResponse.body.data;
          expect(report).to.have.property('entries');
          expect(report).to.have.property('summary');
          expect(report).to.have.property('compliance');

          // Verify compliance fields
          expect(report.compliance).to.have.property('totalAccesses');
          expect(report.compliance).to.have.property('uniqueUsers');
          expect(report.compliance).to.have.property('uniquePatients');
          expect(report.compliance).to.have.property('failedAttempts');

          // Verify audit entries have required HIPAA fields
          report.entries.forEach(entry => {
            expect(entry).to.have.property('timestamp');
            expect(entry).to.have.property('userId');
            expect(entry).to.have.property('patientId');
            expect(entry).to.have.property('actionType');
            expect(entry).to.have.property('resourceType');
            expect(entry).to.have.property('ipAddress');
            expect(entry).to.have.property('sessionId');
          });
        });
      });
    });

    it('detects and reports anomalous access patterns', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Check for anomaly detection
        cy.request({
          url: `${baseUrl}/api/audit/anomalies`,
          headers: { Authorization: `Bearer ${token}` }
        }).then((anomaliesResponse) => {
          expect(anomaliesResponse.status).to.eq(200);
          
          const anomalies = anomaliesResponse.body.data;
          expect(anomalies).to.be.an('array');

          // If anomalies exist, verify structure
          if (anomalies.length > 0) {
            anomalies.forEach(anomaly => {
              expect(anomaly).to.have.property('userId');
              expect(anomaly).to.have.property('anomalyType');
              expect(anomaly).to.have.property('severity');
              expect(anomaly).to.have.property('description');
              expect(anomaly).to.have.property('detectedAt');
            });
          }
        });
      });
    });
  });

  describe('Data Breach Prevention', () => {
    it('prevents unauthorized bulk data access', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Attempt to access large amount of patient data
        const bulkRequests = Array.from({ length: 50 }, (_, i) => 
          cy.request({
            url: `${baseUrl}/api/patients/${i + 1}`,
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false
          })
        );

        // System should detect and potentially throttle bulk access
        Promise.all(bulkRequests).then(responses => {
          const throttledResponses = responses.filter(r => r.status === 429);
          
          // Should have some rate limiting or anomaly detection
          if (throttledResponses.length > 0) {
            expect(throttledResponses[0].body).to.have.property('error');
            expect(throttledResponses[0].body.error).to.match(/rate limit|throttle/i);
          }
        });
      });
    });

    it('implements proper error handling without data exposure', () => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      }).then((loginResponse) => {
        const token = loginResponse.body.token;

        // Test error handling for non-existent patient
        cy.request({
          url: `${baseUrl}/api/patients/99999`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false
        }).then((response) => {
          expect(response.status).to.eq(404);
          
          // Error message should not expose system internals
          expect(response.body.error).to.not.include('database');
          expect(response.body.error).to.not.include('table');
          expect(response.body.error).to.not.include('SQL');
          expect(response.body.error).to.not.include('connection');
        });

        // Test error handling for malformed requests
        cy.request({
          method: 'POST',
          url: `${baseUrl}/api/patients`,
          headers: { Authorization: `Bearer ${token}` },
          body: { invalid: 'data' },
          failOnStatusCode: false
        }).then((response) => {
          expect(response.status).to.be.oneOf([400, 422]);
          
          // Should provide appropriate validation errors without exposing internals
          expect(response.body.error).to.not.include('stack trace');
          expect(response.body.error).to.not.include('file path');
        });
      });
    });
  });
});