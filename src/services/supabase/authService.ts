import { authApi } from '../api/authApi';
import { useAuthStore } from '../../store';
import { Shop, User } from '../../types';

export const authService = {
  async registerShop(params: {
    shopName: string;
    ownerName: string;
    phone: string;
    address?: string;
    pin: string;
    shopType?: string;
  }): Promise<{ shop: Shop; user: User }> {
    const res = await authApi.verifySignup({
      phone: params.phone,
      otp: '',
      pin: params.pin,
      shopName: params.shopName,
      ownerName: params.ownerName,
      address: params.address,
      shopType: params.shopType ?? 'grocery',
    });
    await authApi.saveTokens(res);
    useAuthStore.getState().setShop(res.shop);
    useAuthStore.getState().setUser(res.user);
    useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
    return { shop: res.shop, user: res.user };
  },

  async findShopByPhone(phone: string): Promise<Shop | null> {
    try {
      const { shop } = await authApi.getMe();
      return shop;
    } catch { return null; }
  },

  async getShopUsers(shopId: string): Promise<User[]> {
    const { staffApi } = await import('../api/staffApi');
    return staffApi.list();
  },

  async loginWithPin(user: User, pin: string): Promise<boolean> {
    try {
      const shop = useAuthStore.getState().shop;
      if (!shop) return false;
      const res = user.role === 'owner'
        ? await authApi.ownerLogin(shop.phone, pin)
        : await authApi.staffLogin(user.phone ?? shop.phone, pin, shop.id);
      await authApi.saveTokens(res);
      useAuthStore.getState().setUser(res.user);
      useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
      return true;
    } catch { return false; }
  },

  async addHelper(params: { name: string; phone?: string; pin: string }): Promise<User> {
    const { staffApi } = await import('../api/staffApi');
    return staffApi.create({ name: params.name, phone: params.phone, pin: params.pin, role: 'helper' });
  },

  logout() {
    authApi.clearTokens();
    useAuthStore.getState().logout();
  },
};
