"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  adminCountEmailRecipients,
  adminGetPlans,
  adminListEmails,
  adminSendEmail,
  adminSendTestEmail,
  type AdminEmailCampaign,
  type AdminEmailDraft,
} from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { useAdminList } from "@/hooks/useAdminList";
import { Badge } from "@/components/ui/badge";
import { DataTable, TableSearch } from "@/components/admin/data-table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/store/toast";
import { Role } from "@/types";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Mail, Send } from "@/lib/icons";

const SUBJECT_MAX = 150;
const BODY_MAX = 20000;
const POLL_MS = 3000;
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

const fieldClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] transition-all focus:border-[var(--color-accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30";

function linkify(line: string): ReactNode[] {
  return line.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const url = part.replace(/[.,;:!?)\]]+$/, "");
    return (
      <Fragment key={i}>
        <a
          href={url}
          className="text-[var(--color-accent)] underline"
          target="_blank"
          rel="noreferrer"
        >
          {url}
        </a>
        {part.slice(url.length)}
      </Fragment>
    );
  });
}

function BodyPreview({ body }: { body: string }) {
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} className="mb-3 text-sm leading-relaxed text-[var(--color-text)]">
          {para.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {linkify(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

function CampaignDrawer({
  c,
  audienceLabel,
  onClose,
}: {
  c: AdminEmailCampaign | null;
  audienceLabel: string;
  onClose: () => void;
}) {
  const t = useTranslations("admin.emails");
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {c && (
          <>
            <SheetHeader>
              <SheetTitle>{c.subject}</SheetTitle>
              <SheetDescription>
                {audienceLabel} · {formatDateTime(c.created_at)}
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-[var(--color-surface-1)] p-4 text-xs">
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("colRecipients")}</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums">{c.recipient_count}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("colSent")}</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums">{c.sent_count}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("colFailed")}</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums">{c.failed_count}</dd>
              </div>
            </dl>
            <div className="mt-5 rounded-xl border border-[var(--color-border)] p-5">
              <BodyPreview body={c.body} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CampaignStatus({ c }: { c: AdminEmailCampaign }) {
  const t = useTranslations("admin.emails");
  const done = Boolean(c.finished_at);
  return (
    <Badge variant={done ? (c.failed_count > 0 ? "amber" : "accent") : "blue"}>
      {done ? t("statusDone") : t("statusSending")}
    </Badge>
  );
}

export function AdminEmailsContent() {
  const t = useTranslations("admin.emails");
  const params = useSearchParams();
  const selectedIds = (params.get("ids") ?? "").split(",").filter(Boolean);
  const idsKey = selectedIds.join(",");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(idsKey ? "ids" : "all");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"test" | "send" | null>(null);

  const plansQuery = useAdminQuery(qk.adminPlans, adminGetPlans);
  const list = useAdminList("emails", { sort: "created_at", pageSize: 10 });
  const history = useAdminQuery(qk.adminList("emails", list.params), () =>
    adminListEmails(list.params),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const audienceDraft = { audience, ids: audience === "ids" ? selectedIds : undefined };
  const count = useAdminQuery([...qk.adminEmails, "count", audience, idsKey], () =>
    adminCountEmailRecipients({ subject: "count", body: "count", ...audienceDraft }),
  );

  const campaigns = history.data?.campaigns ?? [];
  const sending = campaigns.some((c) => !c.finished_at);
  const { refresh, reload } = history;
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [sending, reload]);

  if (!history.user || history.user.role !== Role.Admin) return null;

  const plans = plansQuery.data?.plans ?? [];
  const recipients = count.data?.recipient_count;
  const draft: AdminEmailDraft = { subject: subject.trim(), body, ...audienceDraft };
  const ready = draft.subject.length > 0 && body.trim().length > 0;
  const audienceLabel = (value: string) => {
    if (value === "all") return t("audienceAll");
    if (value === "ids") return t("audienceSelected");
    const id = value.replace(/^plan:/, "");
    return t("audiencePlan", { plan: plans.find((p) => p.id === id)?.name ?? id });
  };

  const sendTest = async () => {
    setBusy("test");
    try {
      const res = await adminSendTestEmail(draft);
      toast.success(t("testSent", { email: res.to }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testFailed"));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    try {
      await adminSendEmail(draft);
      toast.success(t("sendStarted"));
      setConfirming(false);
      setSubject("");
      setBody("");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("sendFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-text-secondary)]">{t("intro")}</p>
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>{t("limitNote")}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="panel space-y-4 p-6">
          <div className="space-y-1.5">
            <label
              htmlFor="email-subject"
              className="text-xs font-medium text-[var(--color-text-secondary)]"
            >
              {t("subject")}
            </label>
            <input
              id="email-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="email-body"
              className="text-xs font-medium text-[var(--color-text-secondary)]"
            >
              {t("body")}
            </label>
            <textarea
              id="email-body"
              rows={10}
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("bodyPlaceholder")}
              className={`${fieldClass} resize-y`}
            />
            <p className="text-end text-[11px] tabular-nums text-[var(--color-text-muted)]">
              {body.length}/{BODY_MAX}
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {t("audience")}
            </span>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger aria-label={t("audience")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("audienceAll")}</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={`plan:${p.id}`}>
                    {t("audiencePlan", { plan: p.name })}
                  </SelectItem>
                ))}
                {selectedIds.length > 0 && (
                  <SelectItem value="ids">
                    {t("audienceSelectedCount", { count: selectedIds.length })}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--color-text-muted)]" aria-live="polite">
              {recipients === undefined ? t("counting") : t("recipients", { count: recipients })}
              {" · "}
              {t("recipientsHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" onClick={sendTest} disabled={!ready || busy !== null}>
              <Mail className="h-4 w-4" />
              {t("sendTest")}
            </Button>
            <Button
              variant="primary"
              onClick={() => setConfirming(true)}
              disabled={!ready || !recipients || busy !== null}
            >
              <Send className="h-4 w-4" />
              {t("send", { count: recipients ?? 0 })}
            </Button>
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t("preview")}
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5">
            {ready ? (
              <>
                <h3 className="mb-3 text-lg font-bold text-[var(--color-text)]">{draft.subject}</h3>
                <BodyPreview body={body} />
                <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
                  {t("previewFooter")}
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">{t("previewEmpty")}</p>
            )}
          </div>
        </section>
      </div>

      <DataTable<AdminEmailCampaign>
        label={t("history")}
        title={
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            {t("history")}
          </h2>
        }
        toolbar={<TableSearch list={list} placeholder={t("searchHistory")} />}
        rows={campaigns}
        rowKey={(c) => c.id}
        list={list}
        total={history.data?.total ?? 0}
        loading={history.loading}
        fetching={history.fetching}
        error={history.error}
        onRetry={refresh}
        empty={{
          icon: <Mail className="h-7 w-7 text-[var(--color-text-muted)]" />,
          title: t("historyEmpty"),
          description: t("historyEmptyDesc"),
        }}
        onRowOpen={(c) => setOpenId(c.id)}
        columns={[
          {
            id: "subject",
            header: t("subject"),
            className: "min-w-[14rem]",
            cell: (c) => (
              <span className="block min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                  {c.subject}
                </span>
                <span className="block truncate text-xs text-[var(--color-text-muted)]">
                  {audienceLabel(c.audience)}
                </span>
              </span>
            ),
          },
          {
            id: "delivery",
            header: t("colDelivery"),
            sortKey: "recipient_count",
            align: "end",
            cell: (c) => (
              <span className="block text-xs tabular-nums">
                <span className="text-[var(--color-text-secondary)]">
                  {t("sentOf", { sent: c.sent_count, total: c.recipient_count })}
                </span>
                {c.failed_count > 0 && (
                  <span className="block text-red-600 dark:text-red-400">
                    {t("failedCount", { failed: c.failed_count })}
                  </span>
                )}
              </span>
            ),
          },
          { id: "status", header: t("colStatus"), cell: (c) => <CampaignStatus c={c} /> },
          {
            id: "created",
            header: t("colSentAt"),
            sortKey: "created_at",
            align: "end",
            cell: (c) => (
              <time
                dateTime={c.created_at}
                title={formatDateTime(c.created_at)}
                className="whitespace-nowrap text-xs tabular-nums text-[var(--color-text-muted)]"
              >
                {formatRelativeTime(c.created_at)}
              </time>
            ),
          },
        ]}
      />
      <CampaignDrawer
        c={campaigns.find((c) => c.id === openId) ?? null}
        audienceLabel={audienceLabel(campaigns.find((c) => c.id === openId)?.audience ?? "all")}
        onClose={() => setOpenId(null)}
      />

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={send}
        title={t("confirmTitle")}
        description={t("confirmDesc", { count: recipients ?? 0, subject: draft.subject })}
        confirmLabel={t("confirmSend")}
        variant="info"
        loading={busy === "send"}
      />
    </div>
  );
}
