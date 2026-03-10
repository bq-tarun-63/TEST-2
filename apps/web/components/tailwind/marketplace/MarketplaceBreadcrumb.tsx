"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { useMarketplaceDiscovery } from "@/contexts/marketplaceDiscoveryContext";

export function MarketplaceBreadcrumb() {
  const pathname = usePathname();
  const { templates, isLoading, fetchTemplates } = useMarketplaceDiscovery();

  // /marketplace               -> []
  // /marketplace/:id           -> [id]
  // /marketplace/preview/:id   -> ["preview", id]
  const segments = pathname.split("/").filter(Boolean).slice(1); // drop "marketplace"
  const isPreview = segments[0] === "preview";
  const templateId = isPreview ? segments[1] : segments[0];

  // Fetch templates if we're on a template page but templates aren't loaded
  useEffect(() => {
    if (templateId && templates.length === 0 && !isLoading) {
      fetchTemplates({ status: "approved" });
    }
  }, [templateId, templates.length, isLoading, fetchTemplates]);

  const template = templateId
    ? templates.find((t) => t.templateId === templateId || String(t._id) === templateId)
    : null;

  const templateName = template?.title ?? (templateId ? "Template" : null);
  const detailHref = template ? `/marketplace/${String(template._id)}` : "/marketplace";

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      <Link
        href="/marketplace"
        className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-medium"
      >
        <Store className="w-4 h-4 shrink-0" />
        <span>Marketplace</span>
      </Link>

      {templateName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 shrink-0" />
          {isPreview ? (
            <>
              <Link
                href={detailHref}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-medium truncate max-w-[180px]"
                title={templateName}
              >
                {templateName}
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 shrink-0" />
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">Preview</span>
            </>
          ) : (
            <span
              className="text-zinc-900 dark:text-zinc-100 font-medium truncate max-w-[200px]"
              title={templateName}
            >
              {templateName}
            </span>
          )}
        </>
      )}
    </nav>
  );
}
