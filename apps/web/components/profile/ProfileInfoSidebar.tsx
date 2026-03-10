import { IUser } from "@/models/types/User";
import { WorkArea } from "@/types/workarea";
import { Mail, FileText, UserCircle2, MenuIcon } from "lucide-react";

interface ProfileInfoSidebarProps {
    userProfile: Partial<IUser>;
    workspaceRole?: string;
    userWorkAreas?: WorkArea[];
}

export function ProfileInfoSidebar({ userProfile, workspaceRole, userWorkAreas }: ProfileInfoSidebarProps) {
    return (
        <div className="w-[252px] min-w-[252px] h-min flex flex-col gap-6">
            <div>
                <div className="flex flex-col gap-4">

                    {/* About Section */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center text-gray-500 dark:text-gray-400 h-6">
                            <div className="flex items-center gap-1.5 w-full text-sm">
                                <MenuIcon className="w-4 h-4" />
                                <span className="truncate">About</span>
                            </div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed min-h-[34px] py-1 px-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                            {userProfile.about || "__"}
                        </div>
                    </div>

                    {/* Email Section */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center text-gray-500 dark:text-gray-400 h-6">
                            <div className="flex items-center gap-1.5 w-full text-sm">
                                <Mail className="w-4 h-4" />
                                <span className="truncate">Email</span>
                            </div>
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-100 min-h-[34px] py-1 px-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-default break-all">
                            {userProfile.email}
                        </div>
                    </div>

                    {/* Membership Section */}
                    {workspaceRole && (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center text-gray-500 dark:text-gray-400 h-6">
                                <div className="flex items-center gap-1.5 w-full text-sm">
                                    <UserCircle2 className="w-4 h-4" />
                                    <span className="truncate">Membership Type</span>
                                </div>
                            </div>
                            <div className="min-h-[34px] py-1 px-1.5">
                                <div className="inline-flex items-center h-5 px-1.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm whitespace-nowrap overflow-hidden text-ellipsis capitalize">
                                    workspace {workspaceRole}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Separator */}
                <div className="w-full h-px bg-gray-200 dark:bg-gray-700 my-4" />

                {/* Collaborators */}
                <div className="pl-1.5">
                    <div className="text-sm leading-5 text-gray-500 dark:text-gray-400 pb-2">Top collaborators</div>
                    <div className="flex flex-col gap-1">
                        <div className="text-sm text-gray-500 dark:text-gray-400">No collaborators yet!</div>
                    </div>
                </div>

                {/* Work Area */}
                <div className="pl-1.5 mt-6">
                    <div className="text-sm leading-5 text-gray-500 dark:text-gray-400 pb-2">Workareas</div>
                    <div className="flex flex-col gap-1">
                        {userWorkAreas && userWorkAreas.length > 0 ? (
                            userWorkAreas.map((wa) => (
                                <div key={wa._id} className="flex gap-1.5 items-center p-1 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                                    {wa.icon ? (
                                        <div className="w-5 h-5 flex items-center justify-center text-base">
                                            {wa.icon}
                                        </div>
                                    ) : (
                                        <div className="w-5 h-5 flex items-center justify-center rounded bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 text-xs font-medium">
                                            {wa.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{wa.name}</div>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-gray-500 dark:text-gray-400">No workareas yet</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
