import { db } from './client';
import { Shop, User } from '../../types';
import { useAuthStore } from '../../store';
import { v4 as uuidv4 } from 'uuid';

function hashPin(pin: string): string { return pin; }

export const authService = {
  async registerShop(params: {
    shopName: string; ownerName: string; phone: string; address?: string; pin: string;
  }): Promise<{ shop: Shop; user: User }> {
    const { data: shopData, error: shopError } = await db.shops()
      .insert({ id: uuidv4(), name: params.shopName, owner_name: params.ownerName, phone: params.phone, address: params.address })
      .select().single();
    if (shopError) throw new Error(shopError.message);
    const shop = shopData as Shop;

    const { data: userData, error: userError } = await db.users()
      .insert({ id: uuidv4(), shop_id: shop.id, name: params.ownerName, phone: params.phone, pin: hashPin(params.pin), role: 'owner' })
      .select().single();
    if (userError) throw new Error(userError.message);
    const user = userData as User;

    useAuthStore.getState().setShop(shop);
    useAuthStore.getState().setUser(user);
    return { shop, user };
  },

  async findShopByPhone(phone: string): Promise<Shop | null> {
    const { data, error } = await db.shops().select('*').eq('phone', phone).single();
    if (error) return null;
    return data as Shop;
  },

  async getShopUsers(shopId: string): Promise<User[]> {
    const { data, error } = await db.users().select('*').eq('shop_id', shopId).eq('is_active', true);
    if (error) throw new Error(error.message);
    return data as User[];
  },

  async loginWithPin(user: User, pin: string): Promise<boolean> {
    if (hashPin(pin) !== user.pin) return false;
    await db.users().update({ last_login: new Date().toISOString() }).eq('id', user.id);
    useAuthStore.getState().setUser(user);
    return true;
  },

  async addHelper(params: { name: string; phone?: string; pin: string }): Promise<User> {
    const { shop } = useAuthStore.getState();
    if (!shop) throw new Error('Not authenticated');
    const { data, error } = await db.users()
      .insert({ id: uuidv4(), shop_id: shop.id, name: params.name, phone: params.phone, pin: hashPin(params.pin), role: 'helper' })
      .select().single();
    if (error) throw new Error(error.message);
    return data as User;
  },

  logout() { useAuthStore.getState().logout(); },
};