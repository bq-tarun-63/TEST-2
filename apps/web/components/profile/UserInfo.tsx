import { IUser } from "@/models/types/User";
import { WorkArea } from "@/types/workarea";
import { ProfileActivityFeed } from "./ProfileActivityFeed";
import { ProfileInfoSidebar } from "./ProfileInfoSidebar";

interface UserInfoProps {
    userProfile: Partial<IUser>;
    workspaceRole?: string;
    userWorkAreas?: WorkArea[];
}

export function UserInfo({ userProfile, workspaceRole, userWorkAreas }: UserInfoProps) {
    return (
        <div className="flex flex-row gap-16 mt-5 flex-wrap md:flex-nowrap">
            <ProfileActivityFeed />
            <ProfileInfoSidebar
                userProfile={userProfile}
                workspaceRole={workspaceRole}
                userWorkAreas={userWorkAreas}
            />
        </div>
    );
}
