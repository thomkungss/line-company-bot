# Test Cases — LINE Company Bot

เอกสาร Test Case สำหรับโปรเจค line-company-bot ครอบคลุมทุก package

---

## สารบัญ

1. [Shared Package](#1-shared-package)
2. [LINE Bot Package](#2-line-bot-package)
3. [Admin Web Package](#3-admin-web-package)

---

# 1. Shared Package

## 1.1 Google Sheets Parser — `sheets-parser.ts`

### TC-SH-001: listCompanySheets — ดึงรายชื่อ Sheet บริษัททั้งหมด

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงรายชื่อ Sheet สำเร็จ | Google Sheet ที่มี 5 sheets | return ชื่อ sheet ทั้งหมดที่ไม่ขึ้นต้นด้วย `_` | High |
| 2 | กรอง Sheet ระบบออก | sheets: `_permissions`, `_versions`, `_chat_logs`, `บริษัท A` | return เฉพาะ `บริษัท A` | High |
| 3 | ไม่มี Sheet บริษัท | มีแค่ `_permissions`, `_versions` | return `[]` (array ว่าง) | Medium |
| 4 | Google API error | API ล่ม / credential หมดอายุ | throw Error พร้อม message | High |

### TC-SH-002: parseCompanySheet — อ่านข้อมูลบริษัทจาก Sheet

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อ่านข้อมูลครบทุก field | Sheet ที่มีข้อมูลครบ | return object Company ที่มี companyNameTh, companyNameEn, registrationNumber, registeredCapital, authorizedSignatory, headOfficeAddress, objectives | High |
| 2 | อ่าน directors สำเร็จ | Sheet ที่มีกรรมการ 3 คน | return directors[] ที่มี name, position ครบ 3 รายการ | High |
| 3 | อ่าน shareholders สำเร็จ | Sheet ที่มีผู้ถือหุ้น 5 คน | return shareholders[] ที่มี name, shares, percentage ครบ 5 รายการ | High |
| 4 | อ่าน documents สำเร็จ | Sheet ที่มีเอกสาร 3 รายการ | return documents[] ที่มี name, driveUrl, driveFileId, expiryDate | High |
| 5 | Sheet ว่าง | Sheet ใหม่ไม่มีข้อมูล | return Company object ที่ทุก field เป็น `''` หรือ `[]` | Medium |
| 6 | Sheet ไม่มีอยู่ | ชื่อ sheet ที่ไม่มี | throw Error | High |
| 7 | ข้อมูลมี field บางตัวขาด | Sheet ที่ไม่มี companyNameEn | return object โดย companyNameEn เป็น `''` ไม่ crash | Medium |

### TC-SH-003: getPermissions — อ่านข้อมูลสิทธิ์ผู้ใช้

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อ่านสิทธิ์ทั้งหมด | Sheet `_permissions` ที่มี 10 rows | return UserPermission[] ครบ 10 รายการ | High |
| 2 | parse role ถูกต้อง | role = `super_admin`, `admin`, `viewer` | แต่ละ object มี role ตรงกับ sheet | High |
| 3 | parse companies ถูกต้อง | column `บริษัท A` = `TRUE`, `บริษัท B` = `FALSE` | companies: `{ 'บริษัท A': true, 'บริษัท B': false }` | High |
| 4 | parse approved | approved = `TRUE` | approved = `true` (boolean) | Medium |
| 5 | parse pendingCompanies | pendingCompanies = `บริษัท A,บริษัท B` | pendingCompanies = `'บริษัท A,บริษัท B'` | Medium |
| 6 | Sheet `_permissions` ไม่มี | ยังไม่สร้าง | throw Error หรือ return `[]` | Medium |

### TC-SH-004: updatePermissions — อัปเดตสิทธิ์ผู้ใช้

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อัปเดต role | เปลี่ยน viewer เป็น admin | Sheet ถูกเขียนลง role = admin | High |
| 2 | อัปเดต companies | เพิ่ม `บริษัท C: true` | column `บริษัท C` = TRUE | High |
| 3 | ลบ pendingCompanies | set pendingCompanies = undefined | cell ว่าง | Medium |
| 4 | เพิ่มผู้ใช้ใหม่ | push user ใหม่เข้า array | row ใหม่ถูกเพิ่มใน sheet | High |

### TC-SH-005: getVersionHistory — อ่านประวัติการเปลี่ยนแปลง

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อ่านประวัติทั้งหมด | Sheet `_versions` ที่มี 20 records | return VersionEntry[] ครบ 20 รายการ | High |
| 2 | กรองตามบริษัท | sheetName = `บริษัท A` | return เฉพาะ records ที่ companySheet = `บริษัท A` | High |
| 3 | ไม่มีประวัติ | Sheet `_versions` ว่าง | return `[]` | Medium |

### TC-SH-006: appendVersion — เพิ่มประวัติการเปลี่ยนแปลง

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | เพิ่มสำเร็จ | VersionEntry ครบทุก field | เพิ่ม row ใหม่ใน `_versions` sheet | High |
| 2 | timestamp ถูกต้อง | ใช้ thaiNow() | format วันเดือนปี เวลา ภาษาไทย | Medium |

### TC-SH-007: getDocumentExpiryStatus — ตรวจสอบสถานะเอกสารหมดอายุ

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | เอกสารหมดอายุแล้ว | expiryDate = วันก่อนวันนี้ | return `'expired'` | High |
| 2 | เอกสารหมดอายุใน 7 วัน | expiryDate = วันนี้ + 5 วัน | return `'expiring-7d'` | High |
| 3 | เอกสารหมดอายุใน 30 วัน | expiryDate = วันนี้ + 20 วัน | return `'expiring-30d'` | High |
| 4 | เอกสารยังไม่หมดอายุ | expiryDate = วันนี้ + 90 วัน | return `'valid'` | Medium |
| 5 | ไม่มีวันหมดอายุ | expiryDate = `''` | return `'no-expiry'` หรือ `null` | Medium |

### TC-SH-008: จัดการข้อมูลบริษัท (CRUD)

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | createCompanySheet | sheetName = `บริษัทใหม่` | สร้าง sheet ใหม่ + Drive folder | High |
| 2 | createCompanySheet ซ้ำ | sheetName ที่มีอยู่แล้ว | throw Error หรือ return error | High |
| 3 | updateCompanyField | sheet, label=`ชื่อบริษัท`, value=`ABC` | อัปเดต cell ที่ตรงกับ label | High |
| 4 | updateCompanyField field ไม่มี | label ที่ไม่มีใน sheet | return null/false | Medium |
| 5 | deleteCompanySheet | sheetName ที่มีอยู่ | ลบ sheet สำเร็จ | High |
| 6 | updateDirectors | array ของ Director[] | อัปเดตส่วนกรรมการใน sheet | High |
| 7 | updateShareholders | array ของ Shareholder[] | อัปเดตส่วนผู้ถือหุ้นใน sheet | High |

### TC-SH-009: จัดการเอกสารใน Sheet

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | addDocumentToSheet | sheet, docName, url, expiryDate | เพิ่ม row เอกสารใหม่ | High |
| 2 | updateDocumentInSheet | sheet, docName ที่มีอยู่, url ใหม่ | อัปเดต URL ใน row เดิม | High |
| 3 | updateDocumentInSheet ไม่พบ | docName ที่ไม่มี | return false | Medium |
| 4 | updateSealInSheet | sheet, driveFileId | อัปเดต field ตราประทับ | High |
| 5 | updateDocumentExpiry | sheet, docName, expiryDate ใหม่ | อัปเดต expiryDate ในเอกสาร | Medium |
| 6 | removeDocumentFromSheet | sheet, docName ที่มีอยู่ | ลบ row เอกสาร | High |
| 7 | removeDocumentFromSheet ไม่พบ | docName ที่ไม่มี | return false | Medium |

---

# 2. LINE Bot Package

## 2.1 Message Handler — `handlers/message.ts`

### TC-LB-001: รับข้อความจาก LINE

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ผู้ใช้ใหม่ไม่มีสิทธิ์ | userId ที่ไม่มีใน permissions (approved=false) | แสดง LIFF หน้าลงทะเบียน | High |
| 2 | ผู้ใช้ที่ยังไม่ approved | userId ที่มี approved=false | แสดงข้อความ "รอการอนุมัติ" | High |
| 3 | ผู้ใช้ที่ approved + มีสิทธิ์ 1 บริษัท | พิมพ์ข้อความอะไรก็ได้ | แสดง Flex ข้อมูลบริษัทนั้น | High |
| 4 | ผู้ใช้ที่ approved + มีสิทธิ์หลายบริษัท | พิมพ์ข้อความอะไรก็ได้ | แสดง Carousel ข้อมูลบริษัททั้งหมด (สูงสุด 12) | High |
| 5 | ผู้ใช้ approved ไม่มีสิทธิ์บริษัทใด | userId ที่ approved แต่ companies = {} | แสดงลิงก์ LIFF ขอสิทธิ์บริษัท | Medium |

## 2.2 Command Handler — `handlers/command.ts`

### TC-LB-002: คำสั่ง /company

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดูบริษัทโดยไม่ระบุชื่อ | `/company` | แสดงรายชื่อบริษัทที่มีสิทธิ์ | High |
| 2 | ดูบริษัทที่มีสิทธิ์ | `/company บริษัท A` | แสดง Flex ข้อมูลบริษัท A | High |
| 3 | ดูบริษัทที่ไม่มีสิทธิ์ | `/company บริษัท X` (ไม่มีสิทธิ์) | แสดงข้อความ "ไม่มีสิทธิ์" | High |
| 4 | ดูบริษัทที่ไม่มีอยู่ | `/company ไม่มีจริง` | แสดงข้อความ "ไม่พบบริษัท" | Medium |

### TC-LB-003: คำสั่ง /docs

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดูเอกสารบริษัท | `/docs บริษัท A` | แสดง Flex รายการเอกสารทั้งหมด | High |
| 2 | บริษัทไม่มีเอกสาร | `/docs บริษัท B` (ไม่มีเอกสาร) | แสดงข้อความ "ยังไม่มีเอกสาร" | Medium |
| 3 | ไม่มีสิทธิ์ดูเอกสาร | canViewDocuments = false | แสดงข้อความ "ไม่มีสิทธิ์ดูเอกสาร" | High |

### TC-LB-004: คำสั่ง /history

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดูประวัติบริษัท | `/history บริษัท A` | แสดง Flex ประวัติเปลี่ยนแปลง | High |
| 2 | ไม่มีประวัติ | `/history บริษัทใหม่` | แสดงข้อความ "ยังไม่มีประวัติ" | Medium |

### TC-LB-005: คำสั่ง /list

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | แสดงรายชื่อบริษัท | `/list` | แสดง Flex รายชื่อบริษัทที่มีสิทธิ์ทั้งหมด | High |
| 2 | ไม่มีบริษัทที่มีสิทธิ์ | `/list` (companies = {}) | แสดงข้อความ "ยังไม่มีสิทธิ์" | Medium |

### TC-LB-006: คำสั่ง /help

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | แสดงวิธีใช้ | `/help` | แสดงข้อความคำสั่งทั้งหมดที่ใช้ได้ | High |

## 2.3 Postback Handler — `handlers/postback.ts`

### TC-LB-010: Postback Actions

| # | Test Case | Postback Data | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดูรายละเอียดบริษัท | `action=detail&sheet=บริษัท A` | แสดง Flex ข้อมูลเต็มบริษัท A | High |
| 2 | ดูเอกสาร | `action=docs&sheet=บริษัท A` | แสดง Flex รายการเอกสาร | High |
| 3 | ดูผู้ถือหุ้น | `action=shareholders&sheet=บริษัท A` | แสดง Flex ผู้ถือหุ้น | High |
| 4 | ดูประวัติ | `action=history&sheet=บริษัท A` | แสดง Flex ประวัติเปลี่ยนแปลง | High |
| 5 | อนุมัติสมัคร (super_admin) | `action=approve&userId=xxx` | อัปเดต approved=true, ส่ง push message | High |
| 6 | อนุมัติสมัคร (ไม่ใช่ super_admin) | `action=approve&userId=xxx` (viewer ส่ง) | แสดง "เฉพาะ super_admin เท่านั้น" | High |
| 7 | ปฏิเสธสมัคร | `action=reject&userId=xxx` | อัปเดตสถานะ, ส่งข้อความปฏิเสธ | High |
| 8 | อนุมัติเข้าถึงบริษัท | `action=grant_access&userId=xxx` | เพิ่มสิทธิ์บริษัท, ลบ pending | High |
| 9 | ปฏิเสธเข้าถึงบริษัท | `action=reject_access&userId=xxx` | ลบ pendingCompanies, แจ้ง user | High |
| 10 | ดูบริษัททั้งหมด | `action=list_all` | แสดง Carousel บริษัทที่มีสิทธิ์ (max 12) | Medium |
| 11 | user ไม่มีในระบบ | `action=approve&userId=ไม่มี` | แสดง "ไม่พบผู้ใช้นี้" | Medium |
| 12 | ไม่มี pending companies | `action=grant_access&userId=xxx` (ไม่มี pending) | แสดง "ไม่มีคำขอที่รออนุมัติ" | Medium |

## 2.4 AI Chat — `services/claude.ts`

### TC-LB-020: Claude AI ตอบคำถาม

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ถามข้อมูลบริษัท | "ใครเป็นกรรมการบริษัท A" | ตอบชื่อกรรมการจากข้อมูลจริง | High |
| 2 | ถามข้อมูลหลายบริษัท | "เปรียบเทียบทุนจดทะเบียนบริษัท A กับ B" | ตอบจากข้อมูลทั้ง 2 บริษัท | Medium |
| 3 | ถามนอกเรื่อง | "วันนี้อากาศเป็นยังไง" | ตอบว่าเป็น AI สำหรับข้อมูลบริษัทเท่านั้น | Medium |
| 4 | context ยาว | ข้อมูลบริษัทจำนวนมาก | ไม่เกิน token limit, ตอบได้ถูกต้อง | Low |
| 5 | API error | Anthropic API ล่ม | ส่งข้อความ error กลับผู้ใช้ | High |

## 2.5 Version Sync — `services/version.ts`

### TC-LB-030: Sync & Track Changes

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ตรวจพบข้อมูลเปลี่ยน | เปลี่ยน companyNameTh ใน sheet | สร้าง VersionEntry + appendVersion | High |
| 2 | ตรวจพบกรรมการเปลี่ยน | เพิ่มกรรมการใหม่ | สร้าง VersionEntry fieldChanged=กรรมการ | High |
| 3 | ตรวจพบผู้ถือหุ้นเปลี่ยน | เปลี่ยนจำนวนหุ้น | สร้าง VersionEntry fieldChanged=ผู้ถือหุ้น | High |
| 4 | ไม่มีการเปลี่ยนแปลง | ข้อมูลเหมือนเดิม | return `[]` (ไม่มี changes) | Medium |
| 5 | initialLoad | เรียกครั้งแรก | โหลดข้อมูลเข้า cache โดยไม่สร้าง version | High |

### TC-LB-031: Document Expiry Check

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | เอกสารหมดอายุใน 7 วัน | มีเอกสาร expiryDate = วันนี้+5 | Push Flex Message ไปหา admin/super_admin | High |
| 2 | เอกสารหมดอายุใน 30 วัน | มีเอกสาร expiryDate = วันนี้+20 | Push Flex Message แจ้งเตือน | High |
| 3 | ไม่มีเอกสารหมดอายุ | เอกสารทั้งหมดยังไม่หมดอายุ | ไม่ส่งข้อความ, log "No expiring documents" | Medium |
| 4 | ไม่ซ้ำซ้อน | เอกสารเดียวกัน check ซ้ำ | ส่งแจ้งเตือนแค่ครั้งเดียว (deduplicate) | High |
| 5 | ไม่มี admin | ไม่มี user ที่เป็น admin | ไม่ส่งข้อความ, log "No admin users" | Medium |

### TC-LB-032: Cron Job

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | Sync ทุก 6 ชั่วโมง | cron `0 */6 * * *` | เรียก syncAndTrackChanges() | High |
| 2 | Expiry check 9 AM | cron `0 2 * * *` (= 9AM Bangkok) | เรียก checkDocumentExpiry() + clear cache | High |

## 2.6 LIFF API — `routes/liff-api.ts`

### TC-LB-040: LIFF Company Detail

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดูข้อมูลบริษัท (มีสิทธิ์) | GET `/liff/api/company/บริษัท A?userId=xxx` | return company JSON | High |
| 2 | ดูข้อมูลบริษัท (ไม่มีสิทธิ์) | GET `/liff/api/company/บริษัท X?userId=xxx` | 403 "No permission" | High |
| 3 | ไม่ส่ง userId | GET `/liff/api/company/บริษัท A` | return company JSON (ไม่ check สิทธิ์) | Medium |

### TC-LB-041: LIFF Register

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | สมัครสำเร็จ | POST body: userId, displayName, pictureUrl | 200, เพิ่มใน permissions, แจ้ง super_admin | High |
| 2 | สมัครซ้ำ | userId ที่มีอยู่แล้ว | 409 "already_registered" | High |
| 3 | ไม่ส่ง userId | POST body: displayName เท่านั้น | 400 "userId and displayName required" | Medium |
| 4 | ไม่ส่ง displayName | POST body: userId เท่านั้น | 400 "userId and displayName required" | Medium |

### TC-LB-042: LIFF Request Access

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ขอสิทธิ์สำเร็จ | userId + companies: [`บริษัท A`,`บริษัท B`] | 200, บันทึก pendingCompanies, แจ้ง super_admin | High |
| 2 | user ไม่พบ | userId ที่ไม่มี | 404 "User not found" | High |
| 3 | user ยังไม่ approved | userId ที่ approved=false | 403 "User not approved yet" | High |
| 4 | มี pending อยู่แล้ว | userId ที่มี pendingCompanies | 409 "already_pending" | Medium |
| 5 | ไม่ส่ง companies | userId อย่างเดียว | 400 error | Medium |

### TC-LB-043: LIFF Get Permission

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดูสิทธิ์สำเร็จ | GET `/liff/api/permission/xxx` | return canViewDocuments, canDownloadDocuments | High |
| 2 | user ไม่พบ | userId ที่ไม่มี | 404 "User not found" | Medium |

## 2.7 Google Drive — `services/drive.ts`

### TC-LB-050: Drive File Operations

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | Proxy seal image | GET `/drive/seal/:fileId` | stream รูปตราประทับกลับมา | High |
| 2 | View document (PDF) | GET `/drive/view/:fileId` (PDF) | stream PDF | High |
| 3 | View document (Google Doc) | GET `/drive/view/:fileId` (Google Doc) | export เป็น PDF แล้ว stream | High |
| 4 | Download file | GET `/drive/download/:fileId` | stream ไฟล์ + Content-Disposition | High |
| 5 | File ไม่มี | fileId ที่ไม่มีจริง | 404 error | Medium |

## 2.8 LIFF Pages

### TC-LB-060: Doc Viewer — `liff/doc-viewer.html`

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | แสดง PDF | fileId ที่เป็น PDF | แสดงใน Canvas ด้วย pdf.js, scroll ได้ | High |
| 2 | แสดงรูป | fileId ที่เป็น JPG/PNG | แสดงเป็น `<img>` tag | High |
| 3 | Zoom PDF | pinch-to-zoom บน mobile | Canvas ขยาย/ย่อได้ | Medium |
| 4 | บันทึกรูป (PDF) | กดปุ่ม "บันทึกรูป" บน PDF | แปลงเป็น PNG แล้ว download | High |
| 5 | บันทึกรูป (Image) | กดปุ่ม "บันทึกรูป" บนรูป | download รูปตรงๆ | High |
| 6 | ไฟล์โหลดไม่ได้ | fileId เสีย / ไม่มีสิทธิ์ | แสดงข้อผิดพลาด, ไม่ crash | Medium |

---

# 3. Admin Web Package

## 3.1 Authentication — `index.ts`

### TC-AW-001: Login / Logout

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | Login สำเร็จ | username + password ถูกต้อง | redirect ไปหน้า dashboard, ตั้ง cookie | High |
| 2 | Login ผิด password | username ถูก + password ผิด | แสดง error "รหัสผ่านไม่ถูกต้อง" | High |
| 3 | Login ผิด username | username ที่ไม่มี | แสดง error "ไม่พบผู้ใช้" | High |
| 4 | Login ด้วย LINE | redirect ไป LINE Login | callback → ตรวจ token → ตั้ง session | High |
| 5 | Logout | กดปุ่ม Logout | ลบ cookie/session, redirect ไปหน้า login | High |
| 6 | เข้าหน้าที่ต้อง auth โดยไม่ login | เข้า `/api/companies` ตรง | redirect ไปหน้า login หรือ 401 | High |
| 7 | Cookie หมดอายุ | session expired | redirect ไปหน้า login | Medium |

## 3.2 Companies API — `routes/companies.ts`

### TC-AW-010: GET /api/companies — รายชื่อบริษัท

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงบริษัททั้งหมด | มี 5 บริษัทใน sheets | return JSON array ครบ 5 รายการ แต่ละตัวมี sheetName, companyNameTh, directorCount, shareholderCount, documentCount | High |
| 2 | Sheet parse ไม่ได้ | 1 ใน 5 sheet เสีย | return 4 บริษัทปกติ + 1 ที่มี error=true | Medium |
| 3 | ไม่มีบริษัท | ไม่มี sheet บริษัท | return `[]` | Medium |

### TC-AW-011: POST /api/companies — สร้างบริษัทใหม่

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | สร้างสำเร็จ | body: `{ sheetName: "บริษัทใหม่" }` | 200, สร้าง sheet + Drive folder + log version | High |
| 2 | ชื่อซ้ำ | sheetName ที่มีอยู่แล้ว | 409 "already exists" | High |
| 3 | ไม่ส่ง sheetName | body: `{}` | 400 "sheetName is required" | Medium |
| 4 | sheetName เป็น string ว่าง | body: `{ sheetName: "" }` | 400 "sheetName is required" | Medium |
| 5 | sheetName มี whitespace | body: `{ sheetName: "  บริษัท A  " }` | trim แล้วสร้าง | Low |

### TC-AW-012: POST /api/companies/bulk — สร้างหลายบริษัทจาก CSV

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | สร้าง 3 บริษัทสำเร็จ | array 3 companies ครบข้อมูล | created=3, failed=0 | High |
| 2 | บางชื่อซ้ำ | 3 companies แต่ 1 ชื่อซ้ำ | created=2, failed=1, ระบุ error "ชื่อซ้ำ" | High |
| 3 | ชื่อ sheet ว่าง | company ที่ sheetName = "" | failed, error "ชื่อ Sheet ว่าง" | Medium |
| 4 | array ว่าง | companies: [] | 400 "companies array is required" | Medium |
| 5 | มี directors + shareholders | company ที่มี directors[] และ shareholders[] | สร้าง sheet + อัพ directors + shareholders | High |

### TC-AW-013: GET /api/companies/:sheet — ข้อมูลบริษัท

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงข้อมูลสำเร็จ | sheet = `บริษัท A` | return Company JSON ครบทุก field | High |
| 2 | sheet ไม่มี | sheet = `ไม่มีจริง` | 500 error | Medium |

### TC-AW-014: PUT /api/companies/:sheet — อัปเดตข้อมูล

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อัปเดต field สำเร็จ | body: `{ label: "ชื่อบริษัท", value: "ABC" }` | 200, อัปเดต sheet + log version | High |
| 2 | field ไม่มี | label ที่ไม่มีใน sheet | 404 "Field not found" | Medium |
| 3 | ไม่ส่ง label/value | body: `{ value: "test" }` | 400 "label and value required" | Medium |

### TC-AW-015: DELETE /api/companies/:sheet — ลบบริษัท

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ลบสำเร็จ | sheet ที่มีอยู่ | 200 + log version "ลบบริษัท" | High |
| 2 | ลบ sheet ไม่มี | sheet ที่ไม่มี | 500 error | Medium |

### TC-AW-016: PUT /api/companies/:sheet/directors — อัปเดตกรรมการ

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อัปเดตสำเร็จ | directors: `[{name:"สมชาย", position:"กรรมการ"}]` | 200, อัปเดต sheet + log version | High |
| 2 | ไม่ส่ง directors | body: `{}` | 400 "directors array required" | Medium |

### TC-AW-017: PUT /api/companies/:sheet/shareholders — อัปเดตผู้ถือหุ้น

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อัปเดตสำเร็จ | shareholders: `[{name:"สมชาย", shares:100}]` | 200, อัปเดต sheet + log version | High |
| 2 | ไม่ส่ง shareholders | body: `{}` | 400 "shareholders array required" | Medium |

### TC-AW-018: GET /api/companies/mapping — ข้อมูลแผนผังความสัมพันธ์

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงข้อมูลสำเร็จ | มี 3 บริษัท | return companies[] แต่ละตัวมี directors[], shareholders[] | High |
| 2 | บริษัท parse ไม่ได้ | 1 บริษัทเสีย | กรออกไป (filter null) | Medium |

### TC-AW-019: GET /api/companies/expiring — เอกสารหมดอายุ

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | มีเอกสารหมดอายุ | 2 expired + 1 expiring-7d | return 3 รายการ เรียง expired ก่อน | High |
| 2 | ไม่มีเอกสารหมดอายุ | เอกสารทั้งหมด valid | return `[]` | Medium |

### TC-AW-020: GET /api/companies/all-people — รายชื่อบุคคลทั้งหมด

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงข้อมูลสำเร็จ | มีกรรมการ 10 คน, ผู้ถือหุ้น 15 คน | return directors[], shareholders[], directorDetails[], shareholderDetails[], documentDetails[] | High |
| 2 | กรรมการซ้ำหลายบริษัท | สมชายเป็นกรรมการ 3 บริษัท | directors ไม่ซ้ำ (Set), directorDetails มี 3 records | Medium |

## 3.3 Documents API — `routes/documents.ts`

### TC-AW-030: GET /api/documents/:sheet — ดูเอกสาร

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงเอกสารสำเร็จ | sheet ที่มี 3 เอกสาร | return array 3 documents | High |
| 2 | ไม่มีเอกสาร | sheet ไม่มีเอกสาร | return `[]` | Medium |

### TC-AW-031: POST /api/documents/:sheet — อัปโหลดเอกสาร

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อัปโหลด PDF สำเร็จ | ไฟล์ .pdf + documentName | 200, อัปโหลดไป Drive + อัปเดต sheet | High |
| 2 | อัปโหลดตราประทับ (รูป) | ไฟล์ .png + documentName="ตราประทับ" | 200, อัปโหลดรูป + อัปเดต seal | High |
| 3 | อัปโหลดตราประทับ (PDF) | ไฟล์ .pdf + documentName="ตราประทับ" | 200, อนุญาต PDF สำหรับตราประทับ | High |
| 4 | ไฟล์ไม่ใช่ PDF | ไฟล์ .docx + documentName (ไม่ใช่ตราประทับ) | 400 "อนุญาตเฉพาะไฟล์ PDF" | High |
| 5 | ตราประทับไม่ใช่ PDF/รูป | ไฟล์ .docx + documentName="ตราประทับ" | 400 "อนุญาตเฉพาะ PDF หรือรูปภาพ" | High |
| 6 | ไม่มีไฟล์ | ส่ง form ไม่มี file | 400 "No file uploaded" | Medium |
| 7 | พร้อม expiryDate | PDF + documentName + expiryDate | อัปเดต expiryDate ใน sheet | Medium |
| 8 | เอกสารซ้ำ (update) | documentName ที่มีอยู่แล้ว | อัปเดต URL ใน row เดิม | Medium |
| 9 | เอกสารใหม่ (add) | documentName ที่ไม่มี | เพิ่ม row ใหม่ | Medium |
| 10 | ไฟล์เกิน 50MB | ไฟล์ 60MB | multer reject, error | Low |

### TC-AW-032: PUT /api/documents/:sheet/expiry — อัปเดตวันหมดอายุ

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | อัปเดตสำเร็จ | documentName + expiryDate | 200, อัปเดต expiryDate ใน sheet | High |
| 2 | เอกสารไม่พบ | documentName ที่ไม่มี | 404 "Document not found" | Medium |
| 3 | ไม่ส่ง documentName | body ว่าง | 400 "documentName required" | Medium |

### TC-AW-033: DELETE /api/documents/:sheet/row/:docName — ลบ row เอกสาร

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ลบสำเร็จ | docName ที่มีอยู่ | 200 | High |
| 2 | ไม่พบ | docName ที่ไม่มี | 404 "Document row not found" | Medium |

### TC-AW-034: DELETE /api/documents/:fileId — ลบจาก Drive

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ลบสำเร็จ | fileId ที่มีจริง | 200 | High |
| 2 | file ไม่มี | fileId ที่ไม่มี | 500 error | Medium |

### TC-AW-035: GET /api/documents/download/:fileId — ดาวน์โหลดจาก Drive

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดาวน์โหลดสำเร็จ | fileId ที่มีจริง | stream ไฟล์ + headers | High |
| 2 | file ไม่มี | fileId ที่ไม่มี | 404 "File not found" | Medium |

## 3.4 Permissions API — `routes/permissions.ts`

### TC-AW-040: Permissions

| # | Test Case | Input | Expected Result | Priority |
|---|---|---|---|---|
| 1 | ดึงสิทธิ์ทั้งหมด | GET `/api/permissions` | return UserPermission[] ทั้งหมด | High |
| 2 | อัปเดตสิทธิ์ | PUT body: permissions array | อัปเดต sheet สำเร็จ | High |
| 3 | ดึง company sheets | GET `/api/permissions/sheets` | return ชื่อ company sheets ทั้งหมด | Medium |

---

# 4. Non-Functional Test Cases

## 4.1 Performance

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | Response time ปกติ | Request เดียว | ตอบภายใน 5 วินาที | High |
| 2 | Google Sheets rate limit | Request จำนวนมากพร้อมกัน | Queue / retry, ไม่ crash | Medium |
| 3 | Bulk create companies | สร้าง 50 บริษัทพร้อมกัน | delay(500) ระหว่างแต่ละตัว, ไม่เกิน rate limit | Medium |

## 4.2 Security

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | API ต้อง auth | เข้า API โดยไม่มี session | 401 หรือ redirect login | High |
| 2 | LINE webhook verification | request ไม่ได้มาจาก LINE | reject (signature ไม่ตรง) | High |
| 3 | Permission check | viewer สั่ง approve | ปฏิเสธ "เฉพาะ super_admin" | High |
| 4 | LIFF permission check | userId ไม่มีสิทธิ์บริษัท | 403 "No permission" | High |

## 4.3 Error Handling

| # | Test Case | Condition | Expected Result | Priority |
|---|---|---|---|---|
| 1 | Google API ล่ม | Sheets API unreachable | return error message, ไม่ crash server | High |
| 2 | LINE API ล่ม | replyMessage fail | catch error + log, ไม่ crash | High |
| 3 | Anthropic API ล่ม | Claude API fail | return error message ไปหา user | High |
| 4 | Invalid JSON body | body ไม่ใช่ JSON | 400 error | Medium |
| 5 | ภาษาไทยใน URL | sheet ชื่อภาษาไทย encode/decode | ทำงานถูกต้อง | Medium |

---

# 5. สรุปจำนวน Test Cases

| Package | หมวด | จำนวน |
|---|---|---|
| **Shared** | sheets-parser, permissions, version, document | 42 |
| **LINE Bot** | message, command, postback, AI, sync, LIFF, drive, viewer | 55 |
| **Admin Web** | auth, companies, documents, permissions | 47 |
| **Non-Functional** | performance, security, error handling | 14 |
| **รวมทั้งหมด** | | **158 Test Cases** |
