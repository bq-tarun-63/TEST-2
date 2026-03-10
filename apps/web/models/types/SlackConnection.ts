import { ObjectId } from "mongodb"

export interface ISlackConnection {

    _id?: ObjectId;
    userId: string;
    userEmail: string;
    workspaceId: string;


    slackTeamId: string; //slack workspaceID
    slackTeamName: string;
    slackUserId: string;
    slackAccessToken: string;
    slackScopes: string[];
    slackBotUserId: string;


    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;

}