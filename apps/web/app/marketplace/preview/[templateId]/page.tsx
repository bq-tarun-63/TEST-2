import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TemplateReadOnlyViewer } from "@/components/tailwind/marketplace/TemplatePreview";

interface PageProps {
  params: {
    templateId: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: "Template Preview - Marketplace",
  };
}

export default async function TemplatePreviewPage({ params }: PageProps) {
  const { templateId } = params;

  if (!templateId) {
    notFound();
  }

  return (
    <div className="w-full mx-auto py-10 pt-1">
      <TemplateReadOnlyViewer templateId={templateId} />
    </div>
  );
}
