"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { UserCircle2, Building, Loader2 } from "lucide-react";
import type { IUser } from "@/models/types/User";
import { getWithAuth } from "@/lib/api-helpers";
import { UserInfo } from "@/components/profile/UserInfo";

import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useWorkAreaContext } from "@/contexts/workAreaContext";

export default function UserProfilePage() {
    const params = useParams();
    const userId = params?.userId as string;
    const [userProfile, setUserProfile] = useState<Partial<IUser> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Contexts
    const { currentWorkspace } = useWorkspaceContext();
    const { workAreas } = useWorkAreaContext();

    // Derived Data
    const workspaceRole = currentWorkspace?.members?.find((m) => m.userId === userId)?.role;
    const userWorkAreas = workAreas?.filter((wa) => wa.members?.some((m) => m.userId === userId));

    useEffect(() => {
        const fetchProfile = async () => {
            if (!userId) {
                setIsLoading(false);
                return;
            }

            try {
                const data = await getWithAuth<Partial<IUser>>(`/api/user/get/${userId}`);

                // Handle potential error responses if getWithAuth returns error object
                if (data && typeof data === 'object' && 'error' in data) {
                    setError((data as any).message || "Failed to load profile");
                    setUserProfile(null);
                } else {
                    setUserProfile(data as Partial<IUser>);
                }
            } catch (err) {
                console.error("Error fetching profile:", err);
                setError("Failed to load profile");
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [userId]);

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] w-full items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error || !userProfile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-4">
                <div className="bg-gray-100 dark:bg-zinc-800 rounded-full p-4 mb-4">
                    <UserCircle2 className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">User not found</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                    {error || "The user you are looking for does not exist or their profile is not public."}
                </p>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col pb-20">
            {/* Cover Image - Full Width */}
            <div className="relative w-full h-48 md:h-64 bg-gray-100 dark:bg-zinc-800 mb-16">
                {userProfile.coverUrl ? (
                    <img
                        src={userProfile.coverUrl}
                        alt="Cover"
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/5 dark:to-purple-500/5" />
                )}
            </div>

            {/* Content Container - Centered */}
            <div className="w-full max-w-4xl mx-auto px-4">
                {/* Profile Header */}
                <div className="relative px-4 sm:px-8">
                    <div className="absolute -top-24 left-4 sm:left-8">
                        <div className="relative w-32 h-32 rounded-full border-4 border-white dark:border-background overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                            {userProfile.image ? (
                                <img
                                    src={userProfile.image}
                                    alt={userProfile.name || "User"}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 text-gray-400">
                                    <UserCircle2 className="w-16 h-16" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-10 mb-8">
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                            {userProfile.name || "Anonymous User"}
                        </h1>
                    </div>

                    {/* Content Area: Activity Feed + Sidebar Info */}
                    <UserInfo
                        userProfile={userProfile}
                        workspaceRole={workspaceRole}
                        userWorkAreas={userWorkAreas}
                    />

                </div>
            </div>
        </div>
    );
}
