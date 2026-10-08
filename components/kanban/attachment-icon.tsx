import { Bone, FileSpreadsheet, Figma, Image as ImageIcon, Link2, Package, Paperclip } from "lucide-react";
import type { Attachment, AttachmentKind } from "@/lib/types";

const ATTACHMENT_ICONS: Record<AttachmentKind, typeof Paperclip> = {
  image: ImageIcon,
  spreadsheet: FileSpreadsheet,
  build: Package,
  spine: Bone,
  figma: Figma,
  link: Link2,
  other: Paperclip,
};

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

export function AttachmentIcon({ kind, className }: { kind: AttachmentKind; className?: string }) {
  const Icon = ATTACHMENT_ICONS[kind];
  return <Icon className={className} />;
}

export function inferAttachmentKind(filename: string): AttachmentKind {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (["xlsx", "xls", "csv"].includes(extension)) return "spreadsheet";
  if (["zip", "apk", "ipa"].includes(extension)) return "build";
  if (extension === "spine") return "spine";
  return "other";
}

/**
 * 미리보기 버튼을 보여줄지 판단한다. kind==="image"가 기준이지만, 외부에서 온 데이터
 * 등으로 kind가 어긋났을 수 있는 경우를 대비해 확장자도 함께 본다 — 둘 중 하나만
 * 맞아도 이미지로 취급한다. 링크형 첨부(url만 있고 storagePath 없음)는 실제 이미지
 * 파일이 아니라 페이지 링크이므로 이 함수로 이미지 여부를 판단하지 않는다(호출부가
 * storagePath 유무로 따로 구분한다).
 */
export function isImageAttachment(attachment: Pick<Attachment, "kind" | "name">): boolean {
  if (attachment.kind === "image") return true;
  const extension = attachment.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(extension);
}
