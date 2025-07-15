import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';

// Simple English-to-Urdu dictionary for demo
const urduDict: Record<string, string> = {
  blog: 'بلاگ',
  post: 'پوسٹ',
  summary: 'خلاصہ',
  this: 'یہ',
  is: 'ہے',
  a: 'ایک',
  of: 'کا',
  the: 'دی',
  and: 'اور',
  article: 'مضمون',
  content: 'مواد',
  main: 'مرکزی',
  text: 'متن',
  about: 'کے بارے میں',
  for: 'کے لئے',
  in: 'میں',
  to: 'کو',
  with: 'کے ساتھ',
  on: 'پر',
  by: 'کی طرف سے',
  you: 'آپ',
  it: 'یہ',
  are: 'ہیں',
  we: 'ہم',
  // Add more as needed
};

function translateToUrdu(text: string): string {
  // Replace each word in the dictionary (case-insensitive)
  return text.split(/(\s+)/).map(word => {
    const clean = word.toLowerCase().replace(/[^a-z]/gi, '');
    return urduDict[clean] ? urduDict[clean] : word;
  }).join('');
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    // Fetch the blog page
    let html;
    try {
      const response = await axios.get(url);
      html = response.data;
    } catch (err) {
      return NextResponse.json({ error: 'Failed to fetch blog page' }, { status: 400 });
    }

    // Extract main text content using cheerio
    const $ = cheerio.load(html);
    // Try to get main content heuristically
    let text = $('main').text() || $('article').text() || $('body').text();
    text = text.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 50) {
      return NextResponse.json({ error: 'Could not extract blog content' }, { status: 400 });
    }

    // Simulate AI summary: take first 2-3 sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const summary = sentences.slice(0, 3).join(' ').trim();

    // Translate summary to Urdu
    const urduSummary = translateToUrdu(summary);

    // Save summary to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase credentials not set' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: supabaseError } = await supabase.from('summaries').insert([
      { url, summary, urdu_summary: urduSummary }
    ]);
    if (supabaseError) {
      console.log('Supabase error:', supabaseError); // <-- Add this line
      return NextResponse.json({ error: 'Failed to save summary to Supabase' }, { status: 500 });
    }

    // Save full text to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      return NextResponse.json({ error: 'MongoDB URI not set' }, { status: 500 });
    }
    try {
      const client = new MongoClient(mongoUri);
      await client.connect();
      const db = client.db();
      const collection = db.collection('blog_texts');
      await collection.insertOne({ url, fullText: text, created_at: new Date() });
      await client.close();
    } catch (err) {
      console.log('MongoDB error:', err); // <-- Add this line
      return NextResponse.json({ error: 'Failed to save full text to MongoDB' }, { status: 500 });
    }

    return NextResponse.json({
      summary: summary || 'No summary available.',
      urduSummary,
      fullText: text,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
} 