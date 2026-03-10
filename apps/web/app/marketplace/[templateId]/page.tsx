"use client";

import { TemplateDetailView } from "@/components/tailwind/marketplace/discovery/TemplateDetailView";
import { useParams } from "next/navigation";

export default function TemplateDetailPage() {
  const { templateId } = useParams<{ templateId: string }>();
  return <TemplateDetailView templateId={templateId} />;
}
