"use client";

import React from "react";
import { ConnectionCardProps } from "@/components/tailwind/ui/ConnectionCard";

export interface Connection extends Omit<ConnectionCardProps, "icon" | "iconOverlay"> {
  id: string;
  icon: string | React.ReactNode; // Can be image URL or React component
  iconOverlay?: React.ReactNode;
  showPlusIcon?: boolean;
  isConnected?: boolean;
  connectUrl?: string;
  category?: "productivity" | "development" | "communication" | "storage" | "ai";
}

export const AVAILABLE_CONNECTIONS: Connection[] = [
  {
    id: "github",
    name: "GitHub",
    icon: "https://www.books.so/images/external_integrations/github-icon.png",
    description: "View the latest updates from GitHub in books pages and databases",
    badges: ["Link Preview", "Sync"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "development",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    icon: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg",
    description: "Auto-schedule meeting bots from your calendar events with meeting links",
    badges: ["Auto-Schedule", "Real-time Sync"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "productivity",
  },
  {
    id: "github-workspace",
    name: "GitHub (Workspace)",
    icon: "https://www.books.so/images/external_integrations/github-icon.png",
    description: "Enable everyone in your workspace to link PRs in databases and automate workflows",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "development",
  },
  {
    id: "slack",
    name: "Slack",
    icon: "https://www.books.so/images/external_integrations/slack-icon.png",
    description: "Notifications, live links, and workflows between books and Slack",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "communication",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "https://www.books.so/images/external_integrations/jira-icon.png",
    description: "View the latest updates from Jira in books pages and databases",
    badges: ["Link Preview", "Sync"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "productivity",
  },
  {
    id: "jira-sync",
    name: "Jira Sync",
    icon: "https://www.books.so/images/external_integrations/jira-icon.png",
    description: "Sync projects & issues from Jira into books Projects",
    badges: ["Link Preview", "Sync"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "productivity",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    icon: "https://s3-us-west-2.amazonaws.com/public.books-static.com/8fb58690-ee50-4584-b9fd-ca9b524f56aa/google-drive-icon-19632.png",
    description: "Add previews of files.",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "storage",
  },
  {
    id: "figma",
    name: "Figma",
    icon: "/images/external_integrations/figma-icon.png",
    description: "View Figma designs directly in books",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "productivity",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: "https://s3-us-west-2.amazonaws.com/public.books-static.com/50cf5244-07dc-4b4e-a028-963a89e8e6a5/gitlab-logo-500.png",
    description: "View the latest updates from GitLab in books pages and databases",
    badges: ["Link Preview", "Sync"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "development",
  },
  {
    id: "trello",
    name: "Trello",
    icon: "/images/external_integrations/trello-icon.png",
    description: "Easily sync Trello cards in books",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "productivity",
  },
  {
    id: "asana",
    name: "Asana",
    icon: "https://s3-us-west-2.amazonaws.com/public.books-static.com/6b63a33f-21b1-48b0-853c-f026de71513b/Asana-Logo-Vertical-Coral-Black.svg",
    description: "Bring Asana tasks into books to see the latest updates across teams",
    badges: ["Link Preview", "Sync"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "productivity",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    icon: "/images/external_integrations/dropbox-icon.png",
    description: "Add and preview Dropbox files directly in books",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "storage",
  },
  {
    id: "zoom",
    name: "Zoom",
    icon: "/images/external_integrations/zoom-icon.png",
    description: "Easily share Zoom meeting details in books",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "communication",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    icon: "/images/external_integrations/onedrive-icon.png",
    description: "See files from OneDrive and Sharepoint in books",
    badges: ["Link Preview"],
    actionButtonText: "Connect",
    actionButtonVariant: "connect",
    category: "storage",
  },
];
