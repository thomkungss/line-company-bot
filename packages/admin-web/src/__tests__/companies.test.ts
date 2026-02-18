// ===== Mock external dependencies =====

jest.mock('@company-bot/shared', () => ({
    listCompanySheets: jest.fn(),
    parseCompanySheet: jest.fn(),
    updateCompanyField: jest.fn(),
    appendVersion: jest.fn(),
    thaiNow: jest.fn().mockReturnValue('2026-01-01T00:00:00'),
    createCompanySheet: jest.fn(),
    deleteCompanySheet: jest.fn(),
    updateDirectors: jest.fn(),
    updateShareholders: jest.fn(),
    getPermissions: jest.fn().mockResolvedValue([]),
    updatePermissions: jest.fn(),
    getDocumentExpiryStatus: jest.fn(),
}));

jest.mock('../config', () => ({
    config: {
        port: 3001,
        adminUsername: 'admin',
        adminPassword: 'test123',
        sessionSecret: 'test-secret',
    },
}));

import express from 'express';
import request from 'supertest';
import { companiesRouter } from '../routes/companies';
import {
    listCompanySheets,
    parseCompanySheet,
    updateCompanyField,
    appendVersion,
    createCompanySheet,
    deleteCompanySheet,
    updateDirectors,
    updateShareholders,
} from '@company-bot/shared';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/companies', companiesRouter);

const mockListCompanySheets = listCompanySheets as jest.MockedFunction<typeof listCompanySheets>;
const mockParseCompanySheet = parseCompanySheet as jest.MockedFunction<typeof parseCompanySheet>;
const mockUpdateCompanyField = updateCompanyField as jest.MockedFunction<typeof updateCompanyField>;
const mockAppendVersion = appendVersion as jest.MockedFunction<typeof appendVersion>;
const mockCreateCompanySheet = createCompanySheet as jest.MockedFunction<typeof createCompanySheet>;
const mockDeleteCompanySheet = deleteCompanySheet as jest.MockedFunction<typeof deleteCompanySheet>;
const mockUpdateDirectors = updateDirectors as jest.MockedFunction<typeof updateDirectors>;
const mockUpdateShareholders = updateShareholders as jest.MockedFunction<typeof updateShareholders>;

beforeEach(() => {
    jest.clearAllMocks();
});

const mockCompany = {
    sheetName: 'TestCo',
    companyNameTh: 'บริษัท ทดสอบ',
    companyNameEn: 'Test Company',
    registrationNumber: '0105500001234',
    registeredCapital: 1000000,
    directors: [{ name: 'สมชาย', position: 'กรรมการ' }],
    shareholders: [{ name: 'สมหญิง', shares: 5000, percentage: 50 }],
    documents: [{ name: 'หนังสือรับรอง', driveUrl: 'https://drive.google.com/file/d/123/view' }],
};

// ===== GET /api/companies =====
describe('GET /api/companies', () => {
    test('returns all companies with summary', async () => {
        mockListCompanySheets.mockResolvedValue(['TestCo', 'OtherCo']);
        mockParseCompanySheet.mockResolvedValue(mockCompany as any);

        const res = await request(app).get('/api/companies');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].sheetName).toBe('TestCo');
        expect(res.body[0].directorCount).toBe(1);
        expect(res.body[0].shareholderCount).toBe(1);
        expect(res.body[0].documentCount).toBe(1);
    });

    test('returns empty array when no companies', async () => {
        mockListCompanySheets.mockResolvedValue([]);

        const res = await request(app).get('/api/companies');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('handles parse error gracefully', async () => {
        mockListCompanySheets.mockResolvedValue(['GoodCo', 'BadCo']);
        mockParseCompanySheet
            .mockResolvedValueOnce(mockCompany as any)
            .mockRejectedValueOnce(new Error('Parse failed'));

        const res = await request(app).get('/api/companies');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[1].error).toBe(true);
    });
});

// ===== POST /api/companies =====
describe('POST /api/companies', () => {
    test('creates company successfully', async () => {
        mockListCompanySheets.mockResolvedValue([]);
        mockCreateCompanySheet.mockResolvedValue(undefined);
        mockAppendVersion.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/api/companies')
            .send({ sheetName: 'NewCo' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.sheetName).toBe('NewCo');
        expect(mockCreateCompanySheet).toHaveBeenCalledWith('NewCo');
        expect(mockAppendVersion).toHaveBeenCalled();
    });

    test('rejects duplicate company name', async () => {
        mockListCompanySheets.mockResolvedValue(['ExistingCo']);

        const res = await request(app)
            .post('/api/companies')
            .send({ sheetName: 'ExistingCo' });

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already exists');
    });

    test('rejects missing sheetName', async () => {
        const res = await request(app)
            .post('/api/companies')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('sheetName is required');
    });

    test('rejects empty sheetName', async () => {
        const res = await request(app)
            .post('/api/companies')
            .send({ sheetName: '' });

        expect(res.status).toBe(400);
    });

    test('trims whitespace from sheetName', async () => {
        mockListCompanySheets.mockResolvedValue([]);
        mockCreateCompanySheet.mockResolvedValue(undefined);
        mockAppendVersion.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/api/companies')
            .send({ sheetName: '  TrimCo  ' });

        expect(res.status).toBe(200);
        expect(res.body.sheetName).toBe('TrimCo');
    });
});

// ===== GET /api/companies/:sheet =====
describe('GET /api/companies/:sheet', () => {
    test('returns company detail', async () => {
        mockParseCompanySheet.mockResolvedValue(mockCompany as any);

        const res = await request(app).get('/api/companies/TestCo');

        expect(res.status).toBe(200);
        expect(res.body.companyNameTh).toBe('บริษัท ทดสอบ');
    });

    test('returns 500 for non-existent company', async () => {
        mockParseCompanySheet.mockRejectedValue(new Error('Not found'));

        const res = await request(app).get('/api/companies/NONE');

        expect(res.status).toBe(500);
    });
});

// ===== PUT /api/companies/:sheet =====
describe('PUT /api/companies/:sheet', () => {
    test('updates field successfully', async () => {
        mockUpdateCompanyField.mockResolvedValue({ row: 1, oldValue: 'old' });
        mockAppendVersion.mockResolvedValue(undefined);

        const res = await request(app)
            .put('/api/companies/TestCo')
            .send({ label: 'ชื่อบริษัท', value: 'ใหม่' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.oldValue).toBe('old');
        expect(mockAppendVersion).toHaveBeenCalled();
    });

    test('returns 404 when field not found', async () => {
        mockUpdateCompanyField.mockResolvedValue(null);

        const res = await request(app)
            .put('/api/companies/TestCo')
            .send({ label: 'ไม่มีจริง', value: 'test' });

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    test('returns 400 when missing label', async () => {
        const res = await request(app)
            .put('/api/companies/TestCo')
            .send({ value: 'test' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('required');
    });
});

// ===== DELETE /api/companies/:sheet =====
describe('DELETE /api/companies/:sheet', () => {
    test('deletes company successfully', async () => {
        mockDeleteCompanySheet.mockResolvedValue(undefined);
        mockAppendVersion.mockResolvedValue(undefined);

        const res = await request(app).delete('/api/companies/TestCo');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDeleteCompanySheet).toHaveBeenCalledWith('TestCo');
    });

    test('returns 500 on delete error', async () => {
        mockDeleteCompanySheet.mockRejectedValue(new Error('Delete failed'));

        const res = await request(app).delete('/api/companies/TestCo');

        expect(res.status).toBe(500);
    });
});

// ===== PUT /api/companies/:sheet/directors =====
describe('PUT /api/companies/:sheet/directors', () => {
    test('updates directors successfully', async () => {
        mockParseCompanySheet.mockResolvedValue(mockCompany as any);
        mockUpdateDirectors.mockResolvedValue(undefined);
        mockAppendVersion.mockResolvedValue(undefined);

        const directors = [{ name: 'กรรมการใหม่', position: 'ประธาน' }];

        const res = await request(app)
            .put('/api/companies/TestCo/directors')
            .send({ directors });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(1);
    });

    test('returns 400 when directors not array', async () => {
        const res = await request(app)
            .put('/api/companies/TestCo/directors')
            .send({ directors: 'invalid' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('directors array');
    });
});

// ===== PUT /api/companies/:sheet/shareholders =====
describe('PUT /api/companies/:sheet/shareholders', () => {
    test('updates shareholders successfully', async () => {
        mockParseCompanySheet.mockResolvedValue(mockCompany as any);
        mockUpdateShareholders.mockResolvedValue(undefined);
        mockAppendVersion.mockResolvedValue(undefined);

        const shareholders = [{ name: 'ผู้ถือหุ้นใหม่', shares: 10000 }];

        const res = await request(app)
            .put('/api/companies/TestCo/shareholders')
            .send({ shareholders });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(1);
    });

    test('returns 400 when shareholders not array', async () => {
        const res = await request(app)
            .put('/api/companies/TestCo/shareholders')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('shareholders array');
    });
});
