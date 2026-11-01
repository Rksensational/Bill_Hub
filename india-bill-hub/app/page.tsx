'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  CheckCircle2, Circle, Calendar, CreditCard, 
  Sparkles, Zap, Trash2, ArrowUpRight, Mic
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

interface Task {
  id: string;
  title: string;
  due_datetime: string | null;
  is_completed: boolean;
  priority: string;
}

interface Bill {
  id: string;
  biller_name: string;
  category: string;
  amount: number;
  due_date: string;
  status: string;
  upi_vpa?: string;
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: t } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      const { data: b } = await supabase.from('bills').select('*').order('due_date', { ascending: true });
      if (t) setTasks(t);
      if (b) setBills(b);
    } catch (err) {
      console.warn('Realtime sync fallback active', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('realtime-hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const handleVoiceInput = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice dictation not supported in this browser. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      setInput(event.results[0][0].transcript);
    };
    recognition.start();
  };

  const handleSmartInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      });
      const data = await res.json();

      if (data.entityType === 'bill') {
        await supabase.from('bills').insert([{
          biller_name: data.titleOrBiller,
          category: data.category || 'Electricity',
          amount: data.amount || 0,
          due_date: data.dueDate,
          upi_vpa: data.upiVpa || null,
          status: 'upcoming'
        }]);
      } else {
        await supabase.from('tasks').insert([{
          title: data.titleOrBiller,
          due_datetime: data.dueDate,
          priority: data.priority || 'medium'
        }]);
      }

      setInput('');
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (id: string, currentStatus: boolean) => {
    if (!currentStatus) confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
    await supabase.from('tasks').update({ is_completed: !currentStatus }).eq('id', id);
    fetchData();
  };

  const markBillPaid = async (id: string) => {
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
    await supabase.from('bills').update({ status: 'paid' }).eq('id', id);
    fetchData();
  };

  const deleteBill = async (id: string) => {
    await supabase.from('bills').delete().eq('id', id);
    fetchData();
  };

  const formatINR = (amt: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amt);
  };

  const totalUnpaid = bills.filter(b => b.status !== 'paid').reduce((acc, c) => acc + Number(c.amount), 0);
  const urgentCount = bills.filter(b => b.status !== 'paid' && new Date(b.due_date) <= new Date(Date.now() + 2 * 86400000)).length;

  return (
    <div className="container">
      <header className="header">
        <div className="title-wrap">
          <h1><Zap style={{ color: '#ea580c' }} /> AuraPay & Task Radar (India)</h1>
          <p>₹ INR Format • UPI 1-Tap Pay • Bank SMS Auto-Parser • Automated Daily Telegram Alerts</p>
        </div>
        <div className="badge-live">
          <span style={{ height: 8, width: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
          Live Sync Active
        </div>
      </header>

      <form onSubmit={handleSmartInput} className="search-form">
        <Sparkles className="sparkle-icon" size={20} />
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Paste SMS: 'BESCOM bill Rs 2450 due 28 Oct' or 'File quarterly GST return'..."
          className="search-input"
        />
        <div className="input-actions">
          <button 
            type="button" 
            onClick={handleVoiceInput} 
            className={`btn-mic ${isListening ? 'listening' : ''}`}
            title="Voice input"
          >
            <Mic size={16} />
          </button>
          <button type="submit" disabled={loading} className="btn-submit">
            {loading ? 'AI Parsing...' : 'Add'}
          </button>
        </div>
      </form>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Monthly Unpaid Outflow</div>
          <div className="metric-value">{formatINR(totalUnpaid)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Due in Next 48 Hours</div>
          <div className="metric-value amber">{urgentCount} Bills</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pending Tasks</div>
          <div className="metric-value indigo">{tasks.filter(t => !t.is_completed).length} Remaining</div>
        </div>
      </div>

      <div className="panels-grid">
        <section className="panel">
          <h2 className="panel-header">
            <CreditCard style={{ color: '#ea580c' }} size={20} />
            Bill Radar & Obligations (₹ INR)
          </h2>
          {bills.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No active bills. Paste an SMS above to add one.</p>
          )}
          {bills.map(bill => {
            const upiLink = bill.upi_vpa 
              ? `upi://pay?pa=${encodeURIComponent(bill.upi_vpa)}&pn=${encodeURIComponent(bill.biller_name)}&am=${bill.amount}&cu=INR`
              : null;

            return (
              <div key={bill.id} className={`card-item ${bill.status === 'paid' ? 'paid' : ''}`}>
                <div className="card-header-line">
                  <div>
                    <div className="card-biller">{bill.biller_name}</div>
                    <div className="card-meta">
                      <span className="category-tag">{bill.category}</span>
                      <span className="card-due">Due: {bill.due_date}</span>
                    </div>
                  </div>
                  <div className="card-amount">{formatINR(bill.amount)}</div>
                </div>

                <div className="card-actions">
                  <button onClick={() => deleteBill(bill.id)} className="btn-trash" title="Delete">
                    <Trash2 size={16} />
                  </button>
                  {bill.status !== 'paid' && upiLink && (
                    <a href={upiLink} className="btn-upi">
                      Pay UPI <ArrowUpRight size={14} />
                    </a>
                  )}
                  {bill.status !== 'paid' && (
                    <button onClick={() => markBillPaid(bill.id)} className="btn-paid">
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <h2 className="panel-header">
            <Calendar style={{ color: '#818cf8' }} size={20} />
            Day-to-Day Tasks
          </h2>
          {tasks.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No pending tasks.</p>
          )}
          {tasks.map(task => (
            <div 
              key={task.id} 
              onClick={() => toggleTask(task.id, task.is_completed)}
              className={`task-row ${task.is_completed ? 'completed' : ''}`}
            >
              <div className="task-left">
                {task.is_completed ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                ) : (
                  <Circle size={18} style={{ color: '#64748b' }} />
                )}
                <span className="task-title">{task.title}</span>
              </div>
              <span className="task-date">
                {task.due_datetime ? task.due_datetime.split('T')[0] : 'Today'}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}