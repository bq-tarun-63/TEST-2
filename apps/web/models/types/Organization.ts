import type { ObjectId } from "mongodb";

export interface IOrganization {
  _id?: string | ObjectId;
  id?: string;
  name: string;
  allowedDomains: string;
  ownerUserId: string | ObjectId;
  createdAt: Date;
}

export class Organization implements IOrganization {

  name: string;
  allowedDomains: string;
  ownerUserId: string | ObjectId;
  createdAt: Date;

  constructor(org: IOrganization) {

    this.name = org.name;
    this.allowedDomains = org.allowedDomains;
    this.ownerUserId = org.ownerUserId;
    this.createdAt = org.createdAt || new Date();
  }

  static formatOrganization(org: IOrganization): IOrganization {
    const formattedOrg = { ...org };
    if (org._id) {
      formattedOrg.id = String(org._id);
    }
    return formattedOrg;
  }
}
