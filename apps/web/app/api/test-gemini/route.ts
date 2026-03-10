import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * GET /api/test-gemini
 * Simple test endpoint to verify Gemini API is working
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Check if API key exists
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                {
                    error: 'GEMINI_API_KEY not found in environment variables',
                    message: 'Please add GEMINI_API_KEY to your .env file'
                },
                { status: 500 }
            );
        }

        // 2. Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // 3. Simple test prompt
        const prompt = "Say 'Hello! Gemini AI is working perfectly!' and then tell me a fun fact about AI.";

        // 4. Generate response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 5. Return success
        return NextResponse.json({
            success: true,
            message: 'Gemini API is working!',
            geminiResponse: text,
            model: 'gemini-2.0-flash-exp',
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('[Gemini Test Error]', error);

        return NextResponse.json(
            {
                success: false,
                error: error.message,
                details: error.toString(),
                hint: 'Check if your GEMINI_API_KEY is valid'
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/test-gemini
 * Test with custom prompt
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Check API key
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        // 2. Get custom prompt
        const body = await req.json();
        const { prompt } = body;

        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        // 3. Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // 4. Generate response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 5. Return response
        return NextResponse.json({
            success: true,
            prompt,
            response: text,
            model: 'gemini-2.0-flash-exp'
        });

    } catch (error: any) {
        console.error('[Gemini Test Error]', error);

        return NextResponse.json(
            {
                success: false,
                error: error.message
            },
            { status: 500 }
        );
    }
}
