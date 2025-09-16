import api from './api';

export interface DrugInteraction {
  severity: 'severe' | 'moderate' | 'minor';
  drug1: string;
  drug2: string;
  description: string;
  recommendation: string;
}

export interface Medication {
  id: number;
  name: string;
  dosage: string;
  frequency: string;
  rxnorm_code?: string;
}

class DrugInteractionService {
  async checkInteractions(medications: Medication[]): Promise<DrugInteraction[]> {
    try {
      const response = await api.post('/medications/check-interactions', {
        medications: medications.map(m => ({
          rxnorm_code: m.rxnorm_code,
          name: m.name
        }))
      });
      return response.data.interactions || [];
    } catch (error) {
      console.error('Error checking drug interactions:', error);
      return [];
    }
  }

  async searchMedications(query: string): Promise<Medication[]> {
    try {
      const response = await api.get(`/medications/search?q=${query}`);
      return response.data || [];
    } catch (error) {
      console.error('Error searching medications:', error);
      return [];
    }
  }

  async getAlternatives(medicationId: number): Promise<Medication[]> {
    try {
      const response = await api.get(`/medications/${medicationId}/alternatives`);
      return response.data || [];
    } catch (error) {
      console.error('Error getting alternatives:', error);
      return [];
    }
  }

  async prescribeMedication(prescription: any): Promise<any> {
    try {
      const response = await api.post('/medications/prescribe', prescription);
      return response.data;
    } catch (error) {
      console.error('Error prescribing medication:', error);
      throw error;
    }
  }
}

export default new DrugInteractionService();