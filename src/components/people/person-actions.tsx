"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteContactAction, setContactArchivedAction } from "@/actions/people";
import { ActionButton, ConfirmButton } from "@/components/shared/dialogs";

export function PersonActions({ id, name, archived, canDelete }: { id: string; name: string; archived: boolean; canDelete: boolean }) {
  const t = useTranslations("people.detail");
  const router = useRouter();
  return (
    <>
      {archived ? (
        <ActionButton variant="outline" size="sm" action={() => setContactArchivedAction(id, false)}>
          <ArchiveRestore aria-hidden />
          {t("unarchive")}
        </ActionButton>
      ) : (
        <ConfirmButton
          trigger={{ label: t("archive"), icon: <Archive aria-hidden />, variant: "ghost" }}
          title={t("archive")}
          description={t("archiveConfirm")}
          confirmLabel={t("archive")}
          action={() => setContactArchivedAction(id, true)}
          onDone={() => router.push("/app/people")}
        />
      )}
      {canDelete && (
        <ConfirmButton
          trigger={{ label: t("delete"), icon: <Trash2 aria-hidden />, variant: "ghost" }}
          title={t("delete")}
          description={t("deleteConfirm", { name })}
          confirmLabel={t("delete")}
          destructive
          action={() => deleteContactAction(id)}
          onDone={() => router.replace("/app/people")}
        />
      )}
    </>
  );
}
