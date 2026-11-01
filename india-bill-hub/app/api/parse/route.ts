import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { input } = await req.json();

    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Input text is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const today = new Date().toISOString().split('T')[0];

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are a personal assistant for India.
Extract structured task or bill information from this text or bank/utility SMS: "${input}".
Current date: ${today}.
Currency: Strictly INR (₹).

Return ONLY valid JSON matching this exact structure:
{
  "entityType": "task" or "bill",
  "titleOrBiller": "name of task or utility company (e.g. BESCOM, Airtel, HDFC)",
  "amount": number or null,
  "dueDate": "YYYY-MM-DD",
  "category": "Electricity" or "Broadband" or "Mobile Recharge" or "Credit Card" or "Rent" or "Gas/Piped" or "FASTag" or "OTT/Subscription" or "Other",
  "upiVpa": "payee@bank" or null,
  "priority": "low" or "medium" or "high" or "urgent"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text || '{}');

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}