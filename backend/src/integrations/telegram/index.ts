import axios from 'axios';

const base = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const chatId = () => process.env.TELEGRAM_ALERT_CHAT_ID;

export async function sendTelegramAlert(message: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId()) return;

  await axios.post(`${base()}/sendMessage`, {
    chat_id: chatId(),
    text: message,
    parse_mode: 'Markdown',
  }).catch(() => {});
}

export async function sendTelegramPhoto(caption: string, photoBase64: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId()) return;

  try {
    const raw = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');

    const form = new FormData();
    form.append('chat_id', chatId()!);
    form.append('caption', caption);
    form.append('photo', new Blob([buffer], { type: 'image/png' }), 'qrcode.png');

    await fetch(`${base()}/sendPhoto`, { method: 'POST', body: form });
  } catch {
    await sendTelegramAlert(caption);
  }
}
