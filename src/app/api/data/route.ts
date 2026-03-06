import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
    try {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            console.warn("No DATABASE_URL environment variable found.");
            return NextResponse.json({ data: {} });
        }
        const sql = neon(dbUrl);

        // テーブルが存在しない場合は作成
        await sql`CREATE TABLE IF NOT EXISTS app_state (id VARCHAR PRIMARY KEY, data JSONB)`;

        // データ取得
        const result = await sql`SELECT data FROM app_state WHERE id = 'cal-data'`;

        if (result.length > 0) {
            return NextResponse.json({ data: result[0].data || {} });
        }
        return NextResponse.json({ data: {} });
    } catch (error) {
        console.error("Neon DB GET error:", error);
        return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            return NextResponse.json({ error: "No DATABASE_URL configured" }, { status: 500 });
        }
        const sql = neon(dbUrl);

        const body = await req.json();

        // テーブルが存在しない場合は作成
        await sql`CREATE TABLE IF NOT EXISTS app_state (id VARCHAR PRIMARY KEY, data JSONB)`;

        const jsonBody = JSON.stringify(body);
        // UPSERT (INSERT or UPDATE)
        await sql`INSERT INTO app_state (id, data) VALUES ('cal-data', ${jsonBody}::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Neon DB POST error:", error);
        return NextResponse.json({ error: "Failed to save data" }, { status: 500 });
    }
}
