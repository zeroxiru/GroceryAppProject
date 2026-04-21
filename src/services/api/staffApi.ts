import { apiRequest } from './client';
import { User } from '../../types';

export const staffApi = {
  async list(): Promise<User[]> {
    return apiRequest<User[]>('GET', '/staff');
  },

  async create(params: { name: string; phone?: string; pin: string; role?: 'helper' }): Promise<User> {
    return apiRequest<User>('POST', '/staff', params);
  },

  async deactivate(id: string): Promise<void> {
    return apiRequest<void>('PATCH', `/staff/${id}/deactivate`);
  },

  async reactivate(id: string): Promise<void> {
    return apiRequest<void>('PATCH', `/staff/${id}/reactivate`);
  },
};
