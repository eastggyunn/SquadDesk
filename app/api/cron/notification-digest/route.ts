import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, NotificationDigestRow } from "@/lib/supabase/schema";
import { describeNotification, notificationHref } from "@/lib/notifications";

// 매일 Vercel Cron(vercel.json, 00:00 UTC = 오전 9시 KST)이 부른다.
// 1) 내일 마감인 작업의 담당자에게 task_due_soon 알림을 만들고
// 2) 아직 안 읽고 메일로도 안 보낸 최근 알림을 받는 사람별로 한 통씩 묶어 Resend 배치로 보낸 뒤
// 3) 보낸 알림만 emailed_at을 찍는다 — 실패한 배치의 것은 다음 날 다시 실린다.
export const dynamic = "force-dynamic";

const MAX_ITEMS_PER_EMAIL = 20;
const RESEND_BATCH_SIZE = 100;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDigest(rows: NotificationDigestRow[], siteUrl: string): { subject: string; html: string } {
  const shown = rows.slice(0, MAX_ITEMS_PER_EMAIL);
  const items = shown
    .map((row) => {
      const text = describeNotification({
        kind: row.kind,
        actorName: row.actor_name,
        taskTitle: row.task_title,
        bugTitle: row.bug_title,
        channelName: row.channel_name,
        detail: row.detail,
      });
      const href = notificationHref({
        projectId: row.project_id,
        taskId: row.task_id,
        bugId: row.bug_id,
        channelId: row.channel_id,
      });
      const url = href ? `${siteUrl}${href}` : siteUrl;
      return `<li style="margin:0 0 14px">
  <a href="${escapeHtml(url)}" style="color:#0e7490;text-decoration:none;font-weight:600">${escapeHtml(text)}</a>
  <div style="color:#71717a;font-size:12px;margin-top:2px">${escapeHtml(row.project_name)}</div>
  ${row.excerpt ? `<div style="color:#3f3f46;font-size:13px;margin-top:4px">${escapeHtml(row.excerpt)}</div>` : ""}
</li>`;
    })
    .join("");
  const rest = rows.length - shown.length;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif;max-width:560px;color:#18181b">
  <p style="font-size:15px">${escapeHtml(rows[0].recipient_name)}님, 읽지 않은 알림이 ${rows.length}건 있습니다.</p>
  <ul style="padding-left:18px">${items}</ul>
  ${rest > 0 ? `<p style="color:#71717a;font-size:13px">외 ${rest}건은 앱에서 확인하세요.</p>` : ""}
  <p><a href="${escapeHtml(siteUrl)}" style="color:#0e7490">SquadDesk 열기</a></p>
  <p style="color:#a1a1aa;font-size:12px">알림 종류별 메일 수신은 앱 상단 종 아이콘 › 설정에서 바꿀 수 있습니다.</p>
</div>`;
  return { subject: `[SquadDesk] 읽지 않은 알림 ${rows.length}건`, html };
}

/** 결과를 응답하면서 같은 내용을 한 줄 로그로 남긴다 — Vercel Logs에서 매일 실행 결과를 확인하려고. */
function respond(body: Record<string, unknown>, status = 200) {
  (status === 200 ? console.log : console.error)(`[notification-digest] ${status} ${JSON.stringify(body)}`);
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return respond({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ error: "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다." }, 500);
  }
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const dueSoon = await supabase.rpc("generate_due_soon_notifications");
  if (dueSoon.error) return respond({ error: dueSoon.error.message }, 500);

  // 같은 하루 한 번 크론에 얹어 오래된 게스트 샌드박스를 지운다. DB 행은 함수가 지우고,
  // 돌려받은 첨부 경로는 여기서 Storage에서 지운다(Storage는 SQL로 지울 수 없다).
  const purged = await supabase.rpc("purge_stale_guests");
  if (purged.error) return respond({ error: purged.error.message }, 500);
  const purgedPaths = purged.data ?? [];
  for (let start = 0; start < purgedPaths.length; start += 1000) {
    await supabase.storage.from("attachments").remove(purgedPaths.slice(start, start + 1000));
  }

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;
  if (!resendKey || !from) {
    // 메일 설정 전에도 마감 임박 알림(앱 안)은 만들어지도록 여기서 멈춘다.
    return respond({ dueSoon: dueSoon.data, emailed: 0, skipped: "RESEND_API_KEY/NOTIFICATION_EMAIL_FROM 미설정" });
  }

  const digest = await supabase.rpc("list_notification_digest");
  if (digest.error) return respond({ error: digest.error.message }, 500);

  const byUser = new Map<string, NotificationDigestRow[]>();
  for (const row of digest.data ?? []) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row);
    else byUser.set(row.user_id, [row]);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const sentIds: string[] = [];
  const failures: string[] = [];
  const recipients = Array.from(byUser.values());

  // Resend 배치 API(요청당 최대 100통)로 묶어 보낸다 — 한 통씩 기다리면 받는 사람 수만큼 느려지고
  // 초당 요청 한도에도 걸린다. 배치는 전부 성공하거나 전부 실패하므로 결과를 배치 단위로 센다.
  for (let start = 0; start < recipients.length; start += RESEND_BATCH_SIZE) {
    const chunk = recipients.slice(start, start + RESEND_BATCH_SIZE);
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        chunk.map((rows) => ({ from, to: rows[0].email, ...renderDigest(rows, siteUrl) }))
      ),
    });
    if (response.ok) sentIds.push(...chunk.flat().map((row) => row.notification_id));
    else failures.push(`${response.status} ${await response.text()}`);
  }

  if (sentIds.length > 0) {
    const marked = await supabase.rpc("mark_notifications_emailed", { p_ids: sentIds });
    if (marked.error) return respond({ error: marked.error.message }, 500);
  }

  return respond({
    dueSoon: dueSoon.data,
    recipients: byUser.size,
    emailed: sentIds.length,
    failures,
  });
}
