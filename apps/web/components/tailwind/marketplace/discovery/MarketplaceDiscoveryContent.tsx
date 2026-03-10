"use client";

import { useEffect, useState } from "react";
import { useMarketplaceDiscovery } from "@/contexts/marketplaceDiscoveryContext";
import { useMarketplace } from "@/contexts/marketplaceContext";
import { useAuth } from "@/hooks/use-auth";
import { GenericButton } from "@/components/tailwind/common/GenericButton";
import { TemplateCard } from "@/components/tailwind/marketplace/TemplateCard";
import { Search, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/tailwind/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FAMOUS_CATEGORIES, NAV_GROUPS } from "@/constants/marketplace";
import { ChevronDown } from "lucide-react";


const NAV_ITEMS = [
  { id: "discover", label: "Discover", href: "/marketplace" },
  { id: "work", label: "Work", href: "/marketplace/categories/work" },
  { id: "life", label: "Life", href: "/marketplace/categories/personal" },
  { id: "school", label: "School", href: "/marketplace/categories/school" },
];

export function MarketplaceDiscoveryContent() {
  const {
    templates,
    isLoading,
    fetchTemplates,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedTemplateId,
    setSelectedTemplateId
  } = useMarketplaceDiscovery();
  const { profile, fetchProfile } = useMarketplace();
  const { user } = useAuth();
  const router = useRouter();
  const [localSearchQuery, setLocalSearchQuery] = useState("");

  // Fetch profile and templates on mount
  useEffect(() => {
    fetchProfile();
    fetchTemplates({ status: "approved" });
  }, [fetchProfile, fetchTemplates]);

  // Handle search (now just updates local state for frontend filtering)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(localSearchQuery);
    // No API call here anymore, handled by filteredTemplates useMemo/logic
  };

  // Handle category selection
  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    // No API call here anymore, handled by filteredTemplates useMemo/logic
  };

  // Handle card click
  const handleCardClick = (templateId: string) => {
    router.push(`/marketplace/${templateId}`);
  };

  // Filter templates on the frontend
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      !localSearchQuery ||
      template.title.toLowerCase().includes(localSearchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(localSearchQuery.toLowerCase());

    const matchesCategory =
      !selectedCategory ||
      (template.category && template.category.includes(selectedCategory));

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      {/* Main Content */}
      <div className="relative">
        <div className="relative">
          {/* Navigation */}
          <section className="flex flex-col xl:flex-row justify-between items-start xl:items-center relative w-full gap-4">
            <nav className="flex gap-8">
              <button
                onClick={() => handleCategorySelect(null)}
                className={cn(
                  "text-[28px] leading-9 font-semibold transition-colors",
                  !selectedCategory
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                Discover
              </button>

              {NAV_GROUPS.map((group) => (
                <div key={group.id} className="relative group/nav py-2">
                  <button
                    className={cn(
                      "flex items-center gap-1.5 text-[28px] leading-9 font-semibold transition-colors",
                      group.categories.includes(selectedCategory || "")
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400 group-hover/nav:text-zinc-900 dark:group-hover/nav:text-zinc-100"
                    )}
                  >
                    {group.label}
                    <ChevronDown size={20} className="mt-1 transition-transform group-hover/nav:rotate-180" />
                  </button>

                  {/* Dropdown */}
                  <div className="absolute left-0 top-full pt-2 opacity-0 translate-y-2 pointer-events-none group-hover/nav:opacity-100 group-hover/nav:translate-y-0 group-hover/nav:pointer-events-auto transition-all duration-200 z-50">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-2 min-w-[220px]">
                      {group.categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => handleCategorySelect(cat)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 rounded-lg text-[15px] font-medium transition-colors",
                            selectedCategory === cat
                              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100"
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </nav>
            {/* Search and Button */}
            <div className="flex items-center gap-3 w-full xl:w-auto mt-2 xl:mt-0">
              <form onSubmit={handleSearch} className="relative flex-1 xl:flex-none">
                <div className="relative w-full xl:w-[296px] h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shadow-sm flex items-center px-2.5">
                  <Search className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mr-2" />
                  <input
                    type="search"
                    placeholder="Try 'holiday planning'"
                    value={localSearchQuery}
                    onChange={(e) => setLocalSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                </div>
              </form>
              {user && (
                <GenericButton
                  label={profile ? "Create a template" : "Become a creator"}
                  variant="primary"
                  size="md"
                  onClick={() => router.push("/profile")}
                />
              )}
            </div>
          </section>

          {/* Category Pills */}
          <div className="mt-8">
            <div className="flex flex-wrap gap-1.5 pb-8">
              {FAMOUS_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(selectedCategory === category.id ? null : category.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-2 h-8 rounded-full border transition-colors",
                    selectedCategory === category.id
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent shadow-md"
                      : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  )}
                >
                  <span className="text-base">{category.icon}</span>
                  <span className="text-sm font-normal">{category.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Templates Grid */}
          <div className="pb-16">
            {isLoading ? (
              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
                    <Skeleton className="w-full aspect-video" />
                    <div className="p-4">
                      <Skeleton className="h-5 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full mb-1" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                <Store className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mb-4" />
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No templates found</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {localSearchQuery || selectedCategory ? "Try adjusting your search or filters" : "Check back later for new templates"}
                </p>
              </div>
            ) : (
              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
                {filteredTemplates.map((template) => (
                  <TemplateCard key={template._id} template={template} handleCardClick={() => handleCardClick(template._id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

