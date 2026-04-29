import {
  createPayment,
  findByIdempotencyKey,
  findByAsaasId,
  updateStatusByAsaasId,
} from './payment.repository';
import { Payment } from './payment.types';
import { createCharge } from '../../integrations/asaas';
import { logAudit } from '../audit/audit.service';

export async function chargeForAppointment(
  customerId: string,
  appointmentId: string,
  amount: number,
  idempotencyKey: string,
  customerName: string,
  customerPhone: string,
): Promise<Payment> {
  const existing = await findByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const charge = await createCharge({
    customerId,
    customerName,
    customerPhone,
    amount,
    idempotencyKey,
  });

  const payment = await createPayment({
    customer_id: customerId,
    appointment_id: appointmentId,
    asaas_charge_id: charge.id,
    amount,
    status: 'pending',
    idempotency_key: idempotencyKey,
  });

  await logAudit({
    entity_type: 'payment',
    entity_id: payment.id,
    action: 'created',
    actor: 'bot',
    after_state: payment,
  });

  return payment;
}

export async function handleAsaasWebhook(asaasChargeId: string, event: string): Promise<void> {
  const statusMap: Record<string, 'confirmed' | 'overdue' | 'cancelled'> = {
    PAYMENT_CONFIRMED: 'confirmed',
    PAYMENT_RECEIVED: 'confirmed',
    PAYMENT_OVERDUE: 'overdue',
    PAYMENT_DELETED: 'cancelled',
    PAYMENT_REFUNDED: 'cancelled',
  };

  const status = statusMap[event];
  if (!status) return;

  const before = await findByAsaasId(asaasChargeId);
  if (!before) return;

  await updateStatusByAsaasId(asaasChargeId, status);

  await logAudit({
    entity_type: 'payment',
    entity_id: before.id,
    action: 'updated',
    actor: 'system',
    before_state: before,
    after_state: { ...before, status },
  });
}
