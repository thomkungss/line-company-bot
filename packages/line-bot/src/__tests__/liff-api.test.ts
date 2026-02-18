// ===== Mock external dependencies =====

// Mock @company-bot/shared
jest.mock('@company-bot/shared', () => ({
    parseCompanySheet: jest.fn(),
    getAccessibleCompanies: jest.fn(),
    getVersionHistory: jest.fn(),
    getPermissions: jest.fn(),
    updatePermissions: jest.fn(),
    listCompanySheets: jest.fn(),
    getUserPermission: jest.fn(),
}));

// Mock config
jest.mock('../config', () => ({
    config: {
        lineChannelAccessToken: 'mock-token',
        lineChannelSecret: 'mock-secret',
        liffId: 'mock-liff-id',
    },
}));

// Mock LINE SDK
jest.mock('@line/bot-sdk', () => ({
    Client: jest.fn().mockImplementation(() => ({
        pushMessage: jest.fn().mockResolvedValue({}),
    })),
}));

// Mock flex builder
jest.mock('../flex/registration', () => ({
    buildApprovalRequest: jest.fn().mockReturnValue({ type: 'flex', altText: 'test' }),
    buildCompanyAccessApproval: jest.fn().mockReturnValue({ type: 'flex', altText: 'test' }),
}));

import express from 'express';
import request from 'supertest';
import { liffApiRouter } from '../routes/liff-api';
import {
    parseCompanySheet,
    getAccessibleCompanies,
    getVersionHistory,
    getPermissions,
    updatePermissions,
    listCompanySheets,
    getUserPermission,
} from '@company-bot/shared';

// Create test app
const app = express();
app.use(express.json());
app.use('/liff/api', liffApiRouter);

const mockParseCompanySheet = parseCompanySheet as jest.MockedFunction<typeof parseCompanySheet>;
const mockGetAccessibleCompanies = getAccessibleCompanies as jest.MockedFunction<typeof getAccessibleCompanies>;
const mockGetPermissions = getPermissions as jest.MockedFunction<typeof getPermissions>;
const mockUpdatePermissions = updatePermissions as jest.MockedFunction<typeof updatePermissions>;
const mockListCompanySheets = listCompanySheets as jest.MockedFunction<typeof listCompanySheets>;
const mockGetUserPermission = getUserPermission as jest.MockedFunction<typeof getUserPermission>;
const mockGetVersionHistory = getVersionHistory as jest.MockedFunction<typeof getVersionHistory>;

beforeEach(() => {
    jest.clearAllMocks();
});

// ===== GET /liff/api/company/:sheetName =====
describe('GET /liff/api/company/:sheetName', () => {
    const mockCompany = {
        sheetName: 'TestCo',
        companyNameTh: 'บริษัท ทดสอบ',
        companyNameEn: 'Test Co',
        directors: [],
        shareholders: [],
        documents: [],
    };

    test('returns company data with permission', async () => {
        mockGetAccessibleCompanies.mockResolvedValue(['TestCo']);
        mockParseCompanySheet.mockResolvedValue(mockCompany as any);

        const res = await request(app)
            .get('/liff/api/company/TestCo?userId=U123');

        expect(res.status).toBe(200);
        expect(res.body.sheetName).toBe('TestCo');
        expect(res.body.companyNameTh).toBe('บริษัท ทดสอบ');
    });

    test('returns 403 without permission', async () => {
        mockGetAccessibleCompanies.mockResolvedValue(['OtherCo']);

        const res = await request(app)
            .get('/liff/api/company/TestCo?userId=U123');

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('No permission');
    });

    test('returns company data without userId (no permission check)', async () => {
        mockParseCompanySheet.mockResolvedValue(mockCompany as any);

        const res = await request(app)
            .get('/liff/api/company/TestCo');

        expect(res.status).toBe(200);
        expect(res.body.sheetName).toBe('TestCo');
    });
});

// ===== GET /liff/api/versions/:sheetName =====
describe('GET /liff/api/versions/:sheetName', () => {
    test('returns version history', async () => {
        const mockVersions = [
            { timestamp: '2026-01-01', companySheet: 'TestCo', fieldChanged: 'ชื่อ', oldValue: 'A', newValue: 'B', changedBy: 'admin' },
        ];
        mockGetVersionHistory.mockResolvedValue(mockVersions);

        const res = await request(app)
            .get('/liff/api/versions/TestCo');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });
});

// ===== POST /liff/api/register =====
describe('POST /liff/api/register', () => {
    test('registers new user successfully', async () => {
        mockGetPermissions.mockResolvedValue([]);
        mockUpdatePermissions.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/liff/api/register')
            .send({ userId: 'U999', displayName: 'ทดสอบ', pictureUrl: 'https://example.com/pic.jpg' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockUpdatePermissions).toHaveBeenCalled();
    });

    test('rejects duplicate user', async () => {
        mockGetPermissions.mockResolvedValue([
            { lineUserId: 'U999', displayName: 'ทดสอบ', role: 'viewer', companies: {}, approved: true, canViewDocuments: true, canDownloadDocuments: true },
        ]);

        const res = await request(app)
            .post('/liff/api/register')
            .send({ userId: 'U999', displayName: 'ทดสอบ' });

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('already_registered');
    });

    test('returns 400 when missing userId', async () => {
        const res = await request(app)
            .post('/liff/api/register')
            .send({ displayName: 'ทดสอบ' });

        expect(res.status).toBe(400);
    });

    test('returns 400 when missing displayName', async () => {
        const res = await request(app)
            .post('/liff/api/register')
            .send({ userId: 'U999' });

        expect(res.status).toBe(400);
    });
});

// ===== GET /liff/api/permission/:userId =====
describe('GET /liff/api/permission/:userId', () => {
    test('returns user permission', async () => {
        mockGetUserPermission.mockResolvedValue({
            lineUserId: 'U123',
            displayName: 'Test',
            role: 'viewer',
            canViewDocuments: true,
            canDownloadDocuments: false,
            approved: true,
            companies: {},
        });

        const res = await request(app)
            .get('/liff/api/permission/U123');

        expect(res.status).toBe(200);
        expect(res.body.canViewDocuments).toBe(true);
        expect(res.body.canDownloadDocuments).toBe(false);
    });

    test('returns 404 for unknown user', async () => {
        mockGetUserPermission.mockResolvedValue(null);

        const res = await request(app)
            .get('/liff/api/permission/UNKNOWN');

        expect(res.status).toBe(404);
    });
});

// ===== GET /liff/api/companies =====
describe('GET /liff/api/companies', () => {
    test('returns company list', async () => {
        mockListCompanySheets.mockResolvedValue(['Company A', 'Company B']);

        const res = await request(app)
            .get('/liff/api/companies');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(['Company A', 'Company B']);
    });
});

// ===== POST /liff/api/request-access =====
describe('POST /liff/api/request-access', () => {
    test('submits access request successfully', async () => {
        mockGetPermissions.mockResolvedValue([
            { lineUserId: 'U123', displayName: 'Test', role: 'viewer', approved: true, companies: {}, canViewDocuments: true, canDownloadDocuments: true },
        ]);
        mockUpdatePermissions.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/liff/api/request-access')
            .send({ userId: 'U123', companies: ['Company A'] });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('returns 404 for unknown user', async () => {
        mockGetPermissions.mockResolvedValue([]);

        const res = await request(app)
            .post('/liff/api/request-access')
            .send({ userId: 'UNKNOWN', companies: ['Company A'] });

        expect(res.status).toBe(404);
    });

    test('returns 403 for unapproved user', async () => {
        mockGetPermissions.mockResolvedValue([
            { lineUserId: 'U123', displayName: 'Test', role: 'viewer', approved: false, companies: {}, canViewDocuments: true, canDownloadDocuments: true },
        ]);

        const res = await request(app)
            .post('/liff/api/request-access')
            .send({ userId: 'U123', companies: ['Company A'] });

        expect(res.status).toBe(403);
    });

    test('returns 409 if already has pending request', async () => {
        mockGetPermissions.mockResolvedValue([
            { lineUserId: 'U123', displayName: 'Test', role: 'viewer', approved: true, pendingCompanies: 'Company B', companies: {}, canViewDocuments: true, canDownloadDocuments: true },
        ]);

        const res = await request(app)
            .post('/liff/api/request-access')
            .send({ userId: 'U123', companies: ['Company A'] });

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('already_pending');
    });

    test('returns 400 when missing companies', async () => {
        const res = await request(app)
            .post('/liff/api/request-access')
            .send({ userId: 'U123' });

        expect(res.status).toBe(400);
    });
});
