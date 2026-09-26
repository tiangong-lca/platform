export type ReviewsTable = {
  key: string;
  id: string;
  name: string;
  teamName: string;
  modifiedAt?: string;
  userName: string;
  createAt?: string;
  deadline?: string | null;
  isFromLifeCycle: boolean;
  reviewKind?: 'root' | 'reference';
  targetTable?: string;
  stateCode?: number;
  rootMatchesStatus?: boolean;
  rootCanRead?: boolean;
  comments?: { state_code: number }[];
  reviewerCount?: number;
  completedReviewerCount?: number;
  approveOpinionCount?: number;
  rejectOpinionCount?: number;
  actorCommentStateCode?: number | null;
  actorCommentJson?: any;
  actorCommentModifiedAt?: string;
  json: {
    data: {
      id: string;
      version: string;
      name: any;
      table?: string;
    };
    team: {
      name: string;
      id: string;
    };
    user: {
      id: string;
      name: string;
      email: string;
    };
  };
  modelData?: {
    id: string;
    version: string;
    json: any;
    json_tg: any;
  } | null;
};
