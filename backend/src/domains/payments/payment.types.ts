export type PaymentStatus = 'pending' | 'confirmed' | 'overdue' | 'cancelled';

export interface Payment {
  id: string;
  customer_id: string;
  appointment_id: string;
  asaas_charge_id?: string;
  amount: number;
  status: PaymentStatus;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}
