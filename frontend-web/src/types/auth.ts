export type UserRole = "buyer" | "partner";

export type AuthUser = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  role: UserRole;
  boutique_id?: number | null;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type BoutiqueSignupInfo = {
  name: string;
  description?: string;
  location?: string;
};
