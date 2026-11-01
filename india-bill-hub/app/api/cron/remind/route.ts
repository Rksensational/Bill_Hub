import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!supabaseUrl || !supabaseKey || !botToken || !chatId) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const targetDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: bills, error } = await supabase
    .from('bills')
    .select('*')
    .neq('status', 'paid')
    .lte('due_date', targetDate);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!bills || bills.length === 0) {
    return NextResponse.json({ message: 'No upcoming bills due for reminder' });
  }

  let sentCount = 0;

  for (const bill of bills) {
    const formattedAmount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(bill.amount);

    const upiLink = bill.upi_vpa
      ? `upi://pay?pa=${encodeURIComponent(bill.upi_vpa)}&pn=${encodeURIComponent(bill.biller_name)}&am=${bill.amount}&cu=INR`
      : null;

    const message = `🚨 *BILL PAYMENT ALERT (INDIA)*\n\n` +
      `*Payee:* ${bill.biller_name}\n` +
      `*Category:* ${bill.category}\n` +
      `*Amount:* ${formattedAmount}\n` +
      `*Due Date:* ${bill.due_date}\n\n` +
      (upiLink ? `📲 [Tap to Pay via UPI (GPay / PhonePe / Paytm)](${upiLink})\n\n` : '') +
      `_Mark as paid on your live dashboard once settled._`;

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (telegramRes.ok) sentCount++;
  }

  return NextResponse.json({ success: true, dispatched: sentCount });
}