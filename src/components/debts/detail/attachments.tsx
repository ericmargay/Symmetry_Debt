"use client";

import { Download, FileText, ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteAttachmentAction } from "@/actions/movements";
import { ConfirmButton } from "@/components/shared/dialogs";
import { Button } from "@/components/ui/button";
import { isImageMime, RECEIPT_ACCEPT } from "@/lib/attachments";
import { withBasePath } from "@/lib/base-path";

export interface AttachmentItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  canDelete: boolean;
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function attachmentUrl(id: string, options: { download?: boolean; invite?: string | null } = {}): string {
  const query = new URLSearchParams();
  if (options.download) query.set("download", "1");
  if (options.invite) query.set("invite", options.invite);
  const suffix = query.toString();
  return withBasePath(`/api/attachments/${id}${suffix ? `?${suffix}` : ""}`);
}

/** Receipts of a debt or of one movement: open in a new tab (preview), download, delete. */
export function AttachmentList({ items, invite, compact = false }: { items: AttachmentItem[]; invite?: string | null; compact?: boolean }) {
  const t = useTranslations("detail.attachments");
  if (items.length === 0) return null;

  return (
    <ul className={compact ? "flex flex-wrap gap-1.5" : "flex flex-col gap-1.5"}>
      {items.map((item) => {
        const Icon = isImageMime(item.mimeType) ? ImageIcon : FileText;
        return (
          <li key={item.id} className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-background pr-1 text-sm">
            <a
              href={attachmentUrl(item.id, { invite })}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("open", { name: item.fileName })}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-l-lg px-2.5 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-48 truncate">{item.fileName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{size(item.sizeBytes)}</span>
            </a>
            <a
              href={attachmentUrl(item.id, { download: true, invite })}
              aria-label={t("download", { name: item.fileName })}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="size-4" aria-hidden />
            </a>
            {item.canDelete && !invite && (
              <ConfirmButton
                trigger={{ label: null, icon: <Trash2 aria-hidden />, variant: "ghost", size: "icon-sm", ariaLabel: t("delete", { name: item.fileName }) }}
                title={t("deleteConfirm")}
                description={item.fileName}
                destructive
                action={() => deleteAttachmentAction(item.id)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Uploads receipts one by one to the attachments endpoint. Returns how many failed. */
export async function uploadReceipts(files: File[], debtId: string, paymentId?: string | null): Promise<number> {
  let failed = 0;
  for (const file of files) {
    const body = new FormData();
    body.set("debtId", debtId);
    if (paymentId) body.set("paymentId", paymentId);
    body.set("file", file);
    try {
      const response = await fetch(withBasePath("/api/attachments"), { method: "POST", body });
      if (!response.ok) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return failed;
}

export function UploadButton({ debtId, paymentId, maxUploadMb, variant = "outline" }: { debtId: string; paymentId?: string; maxUploadMb: number; variant?: "outline" | "ghost" }) {
  const t = useTranslations();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: File[]) => {
    const accepted = files.filter((file) => file.size <= maxUploadMb * 1024 * 1024);
    if (accepted.length < files.length) toast.error(t("errors.file_too_large", { max: maxUploadMb }));
    if (accepted.length === 0) return;

    setBusy(true);
    let failed = 0;
    for (const file of accepted) {
      const body = new FormData();
      body.set("debtId", debtId);
      if (paymentId) body.set("paymentId", paymentId);
      body.set("file", file);
      try {
        const response = await fetch(withBasePath("/api/attachments"), { method: "POST", body });
        if (!response.ok) {
          failed += 1;
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          const code = payload?.error;
          toast.error(
            code === "file_type_not_allowed"
              ? t("errors.file_type_not_allowed")
              : code === "file_too_large"
                ? t("errors.file_too_large", { max: maxUploadMb })
                : code === "file_empty"
                  ? t("errors.file_empty")
                  : t("errors.generic"),
          );
        }
      } catch {
        failed += 1;
        toast.error(t("errors.network"));
      }
    }
    setBusy(false);
    if (failed < accepted.length) toast.success(t("detail.attachments.uploaded"));
    router.refresh();
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={RECEIPT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Button type="button" variant={variant} size="sm" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
        {busy ? t("detail.attachments.uploading") : t("detail.attachments.add")}
      </Button>
    </>
  );
}
