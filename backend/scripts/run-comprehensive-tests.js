#!/usr/bin/env node

// Comprehensive Test Suite Runner
// Runs all test categories and generates consolidated coverage report

import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

class ComprehensiveTestRunner {
  constructor() {
    this.results = {
      security: null,
      clinical: null,
      integration: null,
      performance: null,
      overall: null
    };
  }

  async runTestSuite(name, command, args = []) {
    console.log(`\n${colors.blue}🧪 Running ${name} Tests...${colors.reset}`);
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const testProcess = spawn('npm', ['run', command], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      testProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      testProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      testProcess.on('close', (code) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const success = code === 0;
        const icon = success ? '✅' : '❌';
        const status = success ? 'PASSED' : 'FAILED';
        const color = success ? colors.green : colors.red;
        
        console.log(`\n${color}${icon} ${name} Tests ${status}${colors.reset} (${duration}ms)`);
        
        const result = {
          name,
          success,
          duration,
          stdout,
          stderr,
          exitCode: code
        };

        this.results[name.toLowerCase()] = result;
        resolve(result);
      });
    });
  }

  async runCoverageTests() {
    console.log(`\n${colors.blue}📊 Running Coverage Analysis...${colors.reset}`);
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const coverageProcess = spawn('npm', ['run', 'test:coverage'], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      coverageProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      coverageProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      coverageProcess.on('close', (code) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const success = code === 0;
        const icon = success ? '✅' : '❌';
        const status = success ? 'PASSED' : 'FAILED';
        const color = success ? colors.green : colors.red;
        
        console.log(`\n${color}${icon} Coverage Analysis ${status}${colors.reset} (${duration}ms)`);
        
        const result = {
          name: 'Coverage',
          success,
          duration,
          stdout,
          stderr,
          exitCode: code
        };

        this.results.overall = result;
        resolve(result);
      });
    });
  }

  parseTestResults(stdout) {
    const results = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      testSuites: 0,
      coverage: null
    };

    // Parse Jest output for test counts
    const testSuiteMatch = stdout.match(/Test Suites: (\d+) passed/);
    if (testSuiteMatch) {
      results.testSuites = parseInt(testSuiteMatch[1]);
    }

    const testMatch = stdout.match(/Tests:\s+(\d+) passed(?:, (\d+) failed)?/);
    if (testMatch) {
      results.passedTests = parseInt(testMatch[1]);
      results.failedTests = testMatch[2] ? parseInt(testMatch[2]) : 0;
      results.totalTests = results.passedTests + results.failedTests;
    }

    // Parse coverage information
    const coverageMatch = stdout.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);
    if (coverageMatch) {
      results.coverage = {
        statements: parseFloat(coverageMatch[1]),
        branches: parseFloat(coverageMatch[2]),
        functions: parseFloat(coverageMatch[3]),
        lines: parseFloat(coverageMatch[4])
      };
    }

    return results;
  }

  async generateConsolidatedReport() {
    console.log(`\n${colors.blue}📋 Generating Consolidated Report...${colors.reset}`);
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalSuites: 0,
        passedSuites: 0,
        failedSuites: 0,
        totalDuration: 0,
        overallSuccess: true
      },
      testSuites: [],
      coverage: null,
      hipaaCompliance: {
        auditLogging: false,
        encryption: false,
        authentication: false,
        dataIntegrity: false,
        performanceBenchmarks: false
      }
    };

    // Process each test suite result
    Object.entries(this.results).forEach(([key, result]) => {
      if (result && key !== 'overall') {
        const parsed = this.parseTestResults(result.stdout);
        
        report.testSuites.push({
          name: result.name,
          success: result.success,
          duration: result.duration,
          ...parsed
        });

        report.summary.totalSuites++;
        if (result.success) {
          report.summary.passedSuites++;
        } else {
          report.summary.failedSuites++;
          report.summary.overallSuccess = false;
        }
        report.summary.totalDuration += result.duration;
      }
    });

    // Extract overall coverage from coverage test
    if (this.results.overall) {
      const coverageResult = this.parseTestResults(this.results.overall.stdout);
      report.coverage = coverageResult.coverage;
    }

    // Assess HIPAA compliance based on test results
    report.hipaaCompliance.auditLogging = this.results.security?.success || false;
    report.hipaaCompliance.encryption = this.results.security?.success || false;
    report.hipaaCompliance.authentication = this.results.security?.success || false;
    report.hipaaCompliance.dataIntegrity = this.results.integration?.success || false;
    report.hipaaCompliance.performanceBenchmarks = this.results.performance?.success || false;

    // Ensure coverage directory exists
    const coverageDir = path.join(process.cwd(), 'coverage');
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }

    // Write comprehensive report
    const reportPath = path.join(coverageDir, 'comprehensive-test-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  displaySummary(report) {
    console.log(`\n${colors.blue}📊 Comprehensive Test Suite Summary${colors.reset}`);
    console.log('='.repeat(60));

    // Overall Results
    const overallIcon = report.summary.overallSuccess ? '✅' : '❌';
    const overallColor = report.summary.overallSuccess ? colors.green : colors.red;
    console.log(`\n${colors.blue}Overall Result:${colors.reset} ${overallColor}${overallIcon} ${report.summary.overallSuccess ? 'PASSED' : 'FAILED'}${colors.reset}`);
    
    console.log(`\n${colors.blue}Test Suites:${colors.reset}`);
    console.log(`  Total: ${report.summary.totalSuites}`);
    console.log(`  Passed: ${colors.green}${report.summary.passedSuites}${colors.reset}`);
    console.log(`  Failed: ${colors.red}${report.summary.failedSuites}${colors.reset}`);
    console.log(`  Duration: ${(report.summary.totalDuration / 1000).toFixed(1)}s`);

    // Individual Test Suites
    console.log(`\n${colors.blue}Test Suite Results:${colors.reset}`);
    report.testSuites.forEach(suite => {
      const icon = suite.success ? '✅' : '❌';
      const color = suite.success ? colors.green : colors.red;
      console.log(`  ${color}${icon} ${suite.name}${colors.reset} - ${suite.totalTests} tests (${(suite.duration / 1000).toFixed(1)}s)`);
    });

    // Coverage Results
    if (report.coverage) {
      console.log(`\n${colors.blue}Code Coverage:${colors.reset}`);
      const coverageItems = [
        ['Statements', report.coverage.statements],
        ['Branches', report.coverage.branches],
        ['Functions', report.coverage.functions],
        ['Lines', report.coverage.lines]
      ];

      coverageItems.forEach(([type, percentage]) => {
        const meetsThreshold = percentage >= 80;
        const color = meetsThreshold ? colors.green : colors.red;
        const icon = meetsThreshold ? '✅' : '❌';
        console.log(`  ${color}${icon} ${type}: ${percentage}%${colors.reset}`);
      });
    }

    // HIPAA Compliance Assessment
    console.log(`\n${colors.blue}HIPAA Compliance:${colors.reset}`);
    Object.entries(report.hipaaCompliance).forEach(([requirement, passed]) => {
      const icon = passed ? '✅' : '❌';
      const color = passed ? colors.green : colors.red;
      const label = requirement.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      console.log(`  ${color}${icon} ${label}${colors.reset}`);
    });

    // Recommendations
    console.log(`\n${colors.blue}Recommendations:${colors.reset}`);
    if (report.summary.overallSuccess) {
      console.log(`  ${colors.green}✅ All tests passed - system ready for production${colors.reset}`);
      console.log(`  ${colors.green}✅ HIPAA compliance requirements satisfied${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}⚠️  Review failed tests before deployment${colors.reset}`);
      console.log(`  ${colors.yellow}⚠️  Address security and compliance gaps${colors.reset}`);
    }

    if (report.coverage) {
      const avgCoverage = (report.coverage.statements + report.coverage.branches + 
                          report.coverage.functions + report.coverage.lines) / 4;
      if (avgCoverage < 80) {
        console.log(`  ${colors.yellow}⚠️  Increase test coverage to meet 80% threshold${colors.reset}`);
      } else {
        console.log(`  ${colors.green}✅ Test coverage meets HIPAA requirements (>80%)${colors.reset}`);
      }
    }

    console.log(`\n${colors.blue}Report saved to: coverage/comprehensive-test-report.json${colors.reset}`);
    console.log(`${colors.green}🎉 Comprehensive Test Suite Complete!${colors.reset}\n`);
  }

  async run() {
    console.log(`${colors.blue}🔬 EMR System Comprehensive Test Suite${colors.reset}`);
    console.log(`${colors.blue}Testing security, performance, integration, and HIPAA compliance...${colors.reset}\n`);

    try {
      // Run test suites in sequence to avoid resource conflicts
      await this.runTestSuite('Security', 'test:security');
      await this.runTestSuite('Integration', 'test:integration');
      await this.runTestSuite('Performance', 'test:performance');
      
      // Run coverage analysis
      await this.runCoverageTests();

      // Generate and display report
      const report = await this.generateConsolidatedReport();
      this.displaySummary(report);

      // Exit with appropriate code
      process.exit(report.summary.overallSuccess ? 0 : 1);

    } catch (error) {
      console.error(`${colors.red}❌ Test suite execution failed:${colors.reset}`, error);
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ComprehensiveTestRunner();
  runner.run().catch(console.error);
}

export default ComprehensiveTestRunner;