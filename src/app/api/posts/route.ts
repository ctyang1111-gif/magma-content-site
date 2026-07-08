import { NextRequest, NextResponse } from "next/server";
import { PublishError, publishPost, verifyApiKey } from "@/lib/publish";

export async function POST(req: NextRequest) {
  if (!verifyApiKey(req.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "인증 실패 — 'Authorization: Bearer {PUBLISH_API_KEY}' 헤더를 확인하세요" },
      { status: 401 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "본문이 JSON 이 아닙니다" }, { status: 422 });
  }
  try {
    const result = await publishPost(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof PublishError) return NextResponse.json(err.body, { status: err.status });
    console.error("[publish] 예기치 못한 오류:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
