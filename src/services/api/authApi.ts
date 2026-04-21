import { apiRequest, tokenStore, OfflineError } from './client';
import { Shop, User } from '../../types';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  shop: Shop;
  user: User;
}

export const authApi = {
  async sendSignupOtp(phone: string): Promise<void> {
    await apiRequest<void>('POST', '/auth/owner/signup/send-otp', { phone });
  },

  async verifySignup(params: {
    phone: string;
    otp: string;
    pin: string;
    shopName: string;
    ownerName: string;
    address?: string;
    shopType: string;
  }): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('POST', '/auth/owner/verify-signup', params);
  },

  async ownerLogin(phone: string, pin: string): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('POST', '/auth/owner/login', { phone, pin });
  },

  async staffLogin(phone: string, pin: string, shopId: string): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('POST', '/auth/staff/login', { phone, pin, shop_id: shopId });
  },

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return apiRequest<AuthTokens>('POST', '/auth/refresh-token', { refreshToken });
  },

  async getMe(): Promise<{ shop: Shop; user: User }> {
    return apiRequest<{ shop: Shop; user: User }>('GET', '/auth/me');
  },

  async saveTokens(tokens: AuthTokens): Promise<void> {
    await tokenStore.set(tokens.accessToken, tokens.refreshToken);
  },

  async clearTokens(): Promise<void> {
    await tokenStore.clear();
  },
};
