import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientApi } from '@/services/api';
import type { Patient, PatientFormData } from '@/types';

export function usePatients(params?: { page?: number; limit?: number; search?: string }) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => patientApi.getPatients(params),
    select: (data) => data.data,
  });
}

export function usePatient(id: number) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientApi.getPatient(id),
    select: (data) => data.data.data,
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PatientFormData) => patientApi.createPatient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PatientFormData> }) =>
      patientApi.updatePatient(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
    },
  });
}

export function useSearchPatients(query: string) {
  return useQuery({
    queryKey: ['patients', 'search', query],
    queryFn: () => patientApi.searchPatients(query),
    select: (data) => data.data.data,
    enabled: query.length >= 2,
  });
}