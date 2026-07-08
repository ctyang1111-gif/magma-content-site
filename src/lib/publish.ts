import fs from "fs";
import path from "path";
import { timingSafeEqual } from "crypto";

export class PublishError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : `publish error ${status}`);
  }
}

export interface PublishResult {
  slug: string;
  url: string;
  mode: "github" | "local";
  commitUrl?: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Authorization 헤더 검증 — timing-safe 비교 (키 길이까지 숨긴다) */
export function verifyApiKey(header: string | null): boolean {
  const expected = process.env.PUBLISH_API_KEY;
  if (!expected) return false;
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function publishPost(input: unknown): Promise<PublishResult> {
  const p = validate(input);
  const slug = makeSlug(p.title, p.slug);
  const date = p.date ?? kstToday();
  const md = buildMarkdown({ ...p, date });

  const hasGitHub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
  if (hasGitHub) {
    const commitUrl = await commitToGitHub(slug, md);
    return { slug, url: `/blog/${slug}`, mode: "github", commitUrl };
  }
  if (process.env.NODE_ENV === "development") {
    writeLocal(slug, md);
    return { slug, url: `/blog/${slug}`, mode: "local" };
  }
  throw new PublishError(500, {
    error: "GITHUB_TOKEN·GITHUB_REPO 미설정 — Vercel 환경변수를 확인하세요 (.env.example 참고)",
  });
}

interface ValidInput {
  title: string;
  description: string;
  content: string;
  tags: string[];
  slug?: string;
  date?: string;
  draft: boolean;
}

function validate(input: unknown): ValidInput {
  const b = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  if (typeof b.title !== "string" || !b.title.trim()) errors.title = "필수 — 비어 있지 않은 문자열";
  if (typeof b.description !== "string" || !b.description.trim()) errors.description = "필수 — 비어 있지 않은 문자열";
  if (typeof b.content !== "string" || !b.content.trim()) errors.content = "필수 — 마크다운 본문";
  if (b.slug !== undefined && (typeof b.slug !== "string" || !SLUG_RE.test(b.slug)))
    errors.slug = "ASCII 소문자·숫자·하이픈만 (예: my-first-post)";
  if (b.date !== undefined && (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)))
    errors.date = "YYYY-MM-DD 형식";
  if (b.tags !== undefined && (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== "string")))
    errors.tags = "문자열 배열";
  if (b.draft !== undefined && typeof b.draft !== "boolean") errors.draft = "true 또는 false";
  if (Object.keys(errors).length > 0) throw new PublishError(422, { error: "검증 실패", fields: errors });
  return {
    title: (b.title as string).trim(),
    description: (b.description as string).trim(),
    content: b.content as string,
    tags: (b.tags as string[] | undefined) ?? [],
    slug: b.slug as string | undefined,
    date: b.date as string | undefined,
    draft: b.draft === true,
  };
}

function makeSlug(title: string, explicit?: string): string {
  if (explicit) return explicit;
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  if (SLUG_RE.test(ascii) && ascii.length >= 3) return ascii;
  const { compact, hhmm } = kstParts();
  return `post-${compact}-${hhmm}`;
}

function kstParts() {
  const iso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  return {
    date: iso.slice(0, 10),
    compact: iso.slice(0, 10).replaceAll("-", ""),
    hhmm: iso.slice(11, 16).replace(":", ""),
  };
}

function kstToday(): string {
  return kstParts().date;
}

/** frontmatter 조립 — 값은 JSON.stringify 로 감싸 YAML 특수문자를 안전하게 처리 */
function buildMarkdown(p: Omit<ValidInput, "slug" | "date"> & { date: string }): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(p.title)}`,
    `description: ${JSON.stringify(p.description)}`,
    `date: ${p.date}`,
    p.tags.length > 0 ? `tags: [${p.tags.map((t) => JSON.stringify(t)).join(", ")}]` : null,
    p.draft ? "draft: true" : null,
    "---",
    "",
    p.content.trim(),
    "",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

async function commitToGitHub(slug: string, md: string): Promise<string | undefined> {
  const repoFull = process.env.GITHUB_REPO as string;
  const url = `https://api.github.com/repos/${repoFull}/contents/content/posts/${slug}.md`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const head = await fetch(url, { headers, cache: "no-store" });
  if (head.status === 200)
    throw new PublishError(409, { error: `slug 중복 — content/posts/${slug}.md 가 이미 있습니다`, slug });
  if (head.status !== 404)
    throw new PublishError(502, { error: `GitHub 조회 실패 (HTTP ${head.status}) — GITHUB_TOKEN 권한·GITHUB_REPO 값을 확인하세요` });
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `post: ${slug} 발행 (publish API)`,
      content: Buffer.from(md, "utf8").toString("base64"),
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new PublishError(502, { error: `GitHub 커밋 실패 (HTTP ${res.status})`, detail });
  }
  const json = (await res.json()) as { commit?: { html_url?: string } };
  return json.commit?.html_url;
}

function writeLocal(slug: string, md: string): void {
  const dir = path.join(process.cwd(), "content", "posts");
  const filePath = path.join(dir, `${slug}.md`);
  if (fs.existsSync(filePath))
    throw new PublishError(409, { error: `slug 중복 — content/posts/${slug}.md 가 이미 있습니다`, slug });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, md, "utf8");
}
