import { Queue, Worker } from 'bullmq';
import { queueConnection, createWorkerConnection } from '../lib/redis';
import { getInstanceStatus, getQrCode } from '../integrations/megaapi';
import { sendTelegramAlert, sendTelegramPhoto } from '../integrations/telegram';
import { logIncident } from '../domains/incidents/incident.service';

export const whatsappMonitorQueue = new Queue('whatsapp-monitor', {
  connection: queueConnection,
});

let lastState: boolean | null = null;

export const whatsappMonitorWorker = new Worker(
  'whatsapp-monitor',
  async () => {
    const connected = await getInstanceStatus();

    if (connected && lastState === false) {
      await sendTelegramAlert('✅ *WhatsApp reconectado!* A instância está online novamente.');
    }

    if (!connected && lastState !== false) {
      await logIncident('high', 'whatsapp_disconnected', 'WhatsApp instance lost connection');
      const qr = await getQrCode().catch(() => '');
      const msg = '⚠️ *WhatsApp desconectado!* Escaneie o QR code para reconectar ou acesse o painel admin.';
      if (qr) {
        await sendTelegramPhoto(msg, qr);
      } else {
        await sendTelegramAlert(msg);
      }
    }

    lastState = connected;
  },
  { connection: createWorkerConnection() },
);
