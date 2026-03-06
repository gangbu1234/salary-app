import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const DATA_KEY = "cal-data";

export async function GET() {
    try {
        const data = await kv.get(DATA_KEY);
        return NextResponse.json({ data: data || {} });
    } catch (error) {
        console.error("KV GET error:", error);
        return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        await kv.set(DATA_KEY, body);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("KV POST error:", error);
        return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
    }
}
