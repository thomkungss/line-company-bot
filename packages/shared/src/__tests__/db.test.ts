// ===== Supabase Mock Setup =====
// Build a proper chainable mock that supports all Supabase query patterns

type MockFn = jest.Mock & { [key: string]: MockFn };

function createSupabaseMock() {
    const responses: Map<string, any> = new Map();
    let callCount = 0;

    function makeChain(): any {
        const handler: ProxyHandler<any> = {
            get(_target, prop) {
                if (prop === 'then') return undefined; // Not a promise by default
                return (...args: any[]) => {
                    const chainProxy = new Proxy(() => { }, handler);
                    // Track calls
                    return chainProxy;
                };
            },
            apply(_target, _thisArg, args) {
                return new Proxy(() => { }, handler);
            },
        };
        return new Proxy(() => { }, handler);
    }

    return { makeChain };
}

// ===== Simple mock approach: mock the module directly =====

const mockSupabase = {
    from: jest.fn(),
};

jest.mock('../supabase', () => ({
    getSupabase: () => mockSupabase,
}));

jest.mock('../google-auth', () => ({
    getDriveClient: jest.fn(),
    getDriveFolderId: jest.fn().mockReturnValue('mock-folder-id'),
}));

import {
    listCompanySheets,
    parseCompanySheet,
    deleteCompanySheet,
    getDocumentExpiryStatus,
    appendVersion,
    appendChatLog,
    getChatHistory,
} from '../db';

beforeEach(() => {
    jest.clearAllMocks();
});

// Helper to create a chainable Supabase query mock
function mockQuery(resolvedValue: any) {
    const chain: any = {};
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'order', 'single', 'limit', 'in'];

    for (const method of methods) {
        chain[method] = jest.fn().mockReturnValue(chain);
    }

    // Make the chain thenable (Promise-like)
    chain.then = (resolve: any) => {
        resolve(resolvedValue);
        return chain;
    };

    return chain;
}

// ===== listCompanySheets =====
describe('listCompanySheets', () => {
    test('returns company names', async () => {
        const query = mockQuery({
            data: [{ sheet_name: 'Company A' }, { sheet_name: 'Company B' }],
            error: null,
        });
        mockSupabase.from.mockReturnValue(query);

        const result = await listCompanySheets();
        expect(mockSupabase.from).toHaveBeenCalledWith('companies');
        expect(result).toEqual(['Company A', 'Company B']);
    });

    test('returns empty array on no data', async () => {
        const query = mockQuery({ data: [], error: null });
        mockSupabase.from.mockReturnValue(query);

        const result = await listCompanySheets();
        expect(result).toEqual([]);
    });

    test('throws on error', async () => {
        const query = mockQuery({ data: null, error: { message: 'DB error' } });
        mockSupabase.from.mockReturnValue(query);

        await expect(listCompanySheets()).rejects.toBeTruthy();
    });
});

// ===== parseCompanySheet =====
describe('parseCompanySheet', () => {
    const mockCompanyRow = {
        id: 1,
        sheet_name: 'TestCo',
        data_date: '01/01/2026',
        company_name_th: 'บริษัท ทดสอบ',
        company_name_en: 'Test Company',
        registration_number: '0105500001234',
        director_count: 2,
        authorized_signatory: 'กรรมการ 2 คน',
        registered_capital: 1000000,
        capital_text: '1,000,000 บาท',
        total_shares: 10000,
        par_value: 100,
        paid_up_shares: 10000,
        paid_up_amount: 1000000,
        head_office_address: '123 ถนนทดสอบ',
        objectives: 'ทดสอบ',
        seal_image_drive_id: 'seal123',
        seal_image_url: '',
    };

    test('returns full Company object', async () => {
        let fromCallNum = 0;

        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'companies') {
                fromCallNum++;
                if (fromCallNum === 1) {
                    // First call: company lookup with .single()
                    return mockQuery({ data: mockCompanyRow, error: null });
                }
            }
            if (table === 'directors') {
                return mockQuery({
                    data: [{ name: 'สมชาย', position: 'กรรมการ', sort_order: 1 }],
                });
            }
            if (table === 'shareholders') {
                return mockQuery({
                    data: [{ name: 'สมหญิง', shares: '5000', percentage: 50, sort_order: 1 }],
                });
            }
            if (table === 'company_documents') {
                return mockQuery({
                    data: [{ name: 'หนังสือรับรอง', drive_file_id: 'doc123', drive_url: 'https://drive.google.com/file/d/doc123/view', expiry_date: '2026-12-31' }],
                });
            }
            return mockQuery({ data: null, error: null });
        });

        const result = await parseCompanySheet('TestCo');

        expect(result.sheetName).toBe('TestCo');
        expect(result.companyNameTh).toBe('บริษัท ทดสอบ');
        expect(result.companyNameEn).toBe('Test Company');
        expect(result.registrationNumber).toBe('0105500001234');
        expect(result.registeredCapital).toBe(1000000);
        expect(result.directors).toHaveLength(1);
        expect(result.shareholders).toHaveLength(1);
        expect(result.documents).toHaveLength(1);
    });

    test('throws when company not found', async () => {
        mockSupabase.from.mockReturnValue(
            mockQuery({ data: null, error: { message: 'Not found' } })
        );

        await expect(parseCompanySheet('NotExist')).rejects.toThrow('Company "NotExist" not found');
    });
});

// ===== deleteCompanySheet =====
describe('deleteCompanySheet', () => {
    test('deletes successfully', async () => {
        const query = mockQuery({ error: null });
        mockSupabase.from.mockReturnValue(query);

        await expect(deleteCompanySheet('TestCo')).resolves.not.toThrow();
        expect(mockSupabase.from).toHaveBeenCalledWith('companies');
    });

    test('throws on error', async () => {
        const query = mockQuery({ error: { message: 'Delete failed' } });
        mockSupabase.from.mockReturnValue(query);

        await expect(deleteCompanySheet('TestCo')).rejects.toBeTruthy();
    });
});

// ===== getDocumentExpiryStatus =====
describe('getDocumentExpiryStatus', () => {
    test('returns null for empty input', () => {
        expect(getDocumentExpiryStatus('')).toBeNull();
        expect(getDocumentExpiryStatus(undefined)).toBeNull();
    });

    test('returns expired for past date', () => {
        const past = new Date();
        past.setDate(past.getDate() - 5);
        const dateStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
        expect(getDocumentExpiryStatus(dateStr)).toBe('expired');
    });

    test('returns expiring-7d for date within 7 days', () => {
        const future = new Date();
        future.setDate(future.getDate() + 3);
        const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
        expect(getDocumentExpiryStatus(dateStr)).toBe('expiring-7d');
    });

    test('returns expiring-30d for date within 30 days', () => {
        const future = new Date();
        future.setDate(future.getDate() + 15);
        const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
        expect(getDocumentExpiryStatus(dateStr)).toBe('expiring-30d');
    });

    test('returns ok for date far in future', () => {
        const future = new Date();
        future.setDate(future.getDate() + 90);
        const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
        expect(getDocumentExpiryStatus(dateStr)).toBe('ok');
    });

    test('handles DD/MM/YYYY format', () => {
        const future = new Date();
        future.setDate(future.getDate() + 90);
        const dateStr = `${String(future.getDate()).padStart(2, '0')}/${String(future.getMonth() + 1).padStart(2, '0')}/${future.getFullYear()}`;
        expect(getDocumentExpiryStatus(dateStr)).toBe('ok');
    });

    test('returns null for invalid date', () => {
        expect(getDocumentExpiryStatus('invalid')).toBeNull();
    });
});

// ===== appendVersion =====
describe('appendVersion', () => {
    test('inserts version entry', async () => {
        const query = mockQuery({ error: null });
        mockSupabase.from.mockReturnValue(query);

        await appendVersion({
            timestamp: '2026-01-01T00:00:00',
            companySheet: 'TestCo',
            fieldChanged: 'ชื่อบริษัท',
            oldValue: 'เก่า',
            newValue: 'ใหม่',
            changedBy: 'admin',
        });

        expect(mockSupabase.from).toHaveBeenCalledWith('version_history');
    });
});

// ===== getChatHistory =====
describe('getChatHistory', () => {
    test('returns chat entries for user', async () => {
        const mockData = [
            { timestamp: '2026-01-01', user_id: 'U123', role: 'user', message: 'hello', company_context: 'Co A' },
            { timestamp: '2026-01-01', user_id: 'U123', role: 'assistant', message: 'สวัสดี', company_context: 'Co A' },
        ];

        const query = mockQuery({ data: mockData, error: null });
        mockSupabase.from.mockReturnValue(query);

        const result = await getChatHistory('U123');
        expect(result).toHaveLength(2);
        // data is reversed — last item first
        expect(result[0].role).toBe('assistant');
        expect(result[1].role).toBe('user');
    });

    test('returns empty on error', async () => {
        const query = mockQuery({ data: null, error: { message: 'fail' } });
        mockSupabase.from.mockReturnValue(query);

        const result = await getChatHistory('U123');
        expect(result).toEqual([]);
    });
});

// ===== appendChatLog =====
describe('appendChatLog', () => {
    test('inserts chat log entry', async () => {
        const query = mockQuery({ error: null });
        mockSupabase.from.mockReturnValue(query);

        await appendChatLog({
            timestamp: '2026-01-01T00:00:00',
            userId: 'U123',
            role: 'user',
            message: 'test message',
            companyContext: 'TestCo',
        });

        expect(mockSupabase.from).toHaveBeenCalledWith('chat_logs');
    });
});
