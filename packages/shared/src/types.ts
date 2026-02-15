// ===== Company Data Types =====

export interface Director {
  name: string;
  position?: string; // e.g. "กรรมการ", "กรรมการผู้จัดการ"
}

export interface ShareBreakdown {
  totalShares: number;
  parValue: number;
  paidUpShares: number;
  paidUpAmount: number;
}

export interface Shareholder {
  order: number;
  name: string;
  shares: number;
  percentage?: number;
}

export interface CompanyDocument {
  name: string;
  driveFileId: string;
  type?: string; // e.g. "หนังสือรับรอง", "บอจ.5"
  driveUrl?: string;
  updatedDate?: string; // วัน update ล่าสุด
}

export interface Company {
  sheetName: string;
  dataDate: string;
  companyNameTh: string;
  companyNameEn: string;
  registrationNumber: string;
  directorCount: number;
  directors: Director[];
  authorizedSignatory: string;
  registeredCapital: number;
  capitalText: string;
  shareBreakdown: ShareBreakdown;
  headOfficeAddress: string;
  objectives: string;
  sealImageDriveId: string;
  sealImageUrl: string; // full URL (for non-Drive hosted images)
  shareholders: Shareholder[];
  documents: CompanyDocument[];
}

// ===== Permission Types =====

export interface UserPermission {
  lineUserId: string;
  displayName: string;
  role: 'super_admin' | 'admin' | 'viewer';
  canViewDocuments: boolean;
  approved?: boolean;
  pictureUrl?: string;
  pendingCompanies?: string; // comma-separated company names awaiting approval
  companies: Record<string, boolean>; // sheetName → hasAccess
}

// ===== Version History =====

export interface VersionEntry {
  timestamp: string;
  companySheet: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
}

// ===== Chat Log =====

export interface ChatLogEntry {
  timestamp: string;
  userId: string;
  role: 'user' | 'assistant';
  message: string;
  companyContext: string;
}

// ===== Config =====

export interface ConfigEntry {
  key: string;
  value: string;
}

// ===== Special Sheet Names =====

export const SPECIAL_SHEETS = {
  PERMISSIONS: '_permissions',
  VERSIONS: '_versions',
  CHAT_LOG: '_chat_log',
  CONFIG: '_config',
} as const;
