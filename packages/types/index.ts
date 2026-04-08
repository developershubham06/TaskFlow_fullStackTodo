export type Role = 'customer' | 'staff' | 'admin';

export interface User {
  id: string;
  email: string;
  password: string;  // Hashed
  name?: string;
  role: Role;
  preferences?: string[];
}