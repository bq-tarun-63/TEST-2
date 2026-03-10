import SettingsPageClient from "./SettingsPageClient";

type SearchParams = {
  tab?: string;
  github?: string;
  calendar?: string;
  scheduled?: string;
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedParams = await searchParams;
  const tabParam = typeof resolvedParams.tab === "string" ? resolvedParams.tab : undefined;
  const githubParam = typeof resolvedParams.github === "string" ? resolvedParams.github : undefined;
  const calendarParam = typeof resolvedParams.calendar === "string" ? resolvedParams.calendar : undefined;
  const scheduledParam = typeof resolvedParams.scheduled === "string" ? resolvedParams.scheduled : undefined;

  return <SettingsPageClient tab={tabParam} github={githubParam} calendar={calendarParam} scheduled={scheduledParam} />;
}


