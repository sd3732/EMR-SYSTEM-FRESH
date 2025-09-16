import api from './api';

export interface LabOrder {
  id: number;
  patient_id: number;
  provider_id: number;
  order_date: string;
  status: 'pending' | 'in-progress' | 'resulted' | 'cancelled';
  priority: 'routine' | 'urgent' | 'stat';
  tests: LabTest[];
}

export interface LabTest {
  id: number;
  loinc_code: string;
  test_name: string;
  specimen_type?: string;
  status: string;
  result?: LabResult;
}

export interface LabResult {
  id: number;
  value: string;
  unit: string;
  reference_range: string;
  abnormal_flag?: 'H' | 'L' | 'HH' | 'LL' | 'N';
  resulted_date: string;
  is_critical: boolean;
}

class LabOrderService {
  async createLabOrder(order: Partial<LabOrder>): Promise<LabOrder> {
    try {
      const response = await api.post('/labs/orders', order);
      return response.data;
    } catch (error) {
      console.error('Error creating lab order:', error);
      throw error;
    }
  }

  async searchLabTests(query: string): Promise<LabTest[]> {
    try {
      const response = await api.get(`/labs/tests/search?q=${query}`);
      return response.data || [];
    } catch (error) {
      console.error('Error searching lab tests:', error);
      return [];
    }
  }

  async getCommonPanels(): Promise<any[]> {
    return [
      { id: 'cbc', name: 'Complete Blood Count', tests: ['WBC', 'RBC', 'Hgb', 'Hct', 'Platelets'] },
      { id: 'bmp', name: 'Basic Metabolic Panel', tests: ['Glucose', 'BUN', 'Creatinine', 'Na', 'K', 'Cl', 'CO2'] },
      { id: 'cmp', name: 'Comprehensive Metabolic Panel', tests: ['BMP + Liver enzymes'] },
      { id: 'ua', name: 'Urinalysis', tests: ['Color', 'Clarity', 'Specific Gravity', 'pH', 'Protein', 'Glucose'] },
      { id: 'strep', name: 'Rapid Strep Test', tests: ['Group A Strep Antigen'] },
      { id: 'flu', name: 'Influenza A/B', tests: ['Influenza A', 'Influenza B'] },
      { id: 'covid', name: 'COVID-19 PCR', tests: ['SARS-CoV-2 RNA'] }
    ];
  }

  async getResults(orderId: number): Promise<LabResult[]> {
    try {
      const response = await api.get(`/labs/orders/${orderId}/results`);
      return response.data || [];
    } catch (error) {
      console.error('Error getting lab results:', error);
      return [];
    }
  }

  async acknowledgeResult(resultId: number): Promise<void> {
    try {
      await api.put(`/labs/results/${resultId}/acknowledge`);
    } catch (error) {
      console.error('Error acknowledging result:', error);
      throw error;
    }
  }
}

export default new LabOrderService();