# PrepSBA Document Templates
## Wizard-Generated SBA Loan Application Package

**Folder:** `PrepSBA/documents/template/`  
**Last Updated:** 2026-07-11  

---

## What's Here

These are the master templates for every document PrepSBA generates for borrowers. Each template uses `[PLACEHOLDER_NAME]` syntax everywhere user-supplied data should appear.

---

## Documents

| File | Document | Wizard Step(s) |
|---|---|---|
| `01_business_plan.md` | Full Business Plan | Steps 1–6 |
| `02_pro_forma_income_statement.md` | Pro Forma Income Statement (5-year) | Step 4 (Financials) |
| `03_pro_forma_balance_sheet.md` | Pro Forma Balance Sheet | Step 4 (Financials) |
| `04_cash_flow_projections.md` | Cash Flow Projections — Monthly Y1, Annual Y1–Y5 | Step 4 (Financials) |
| `05_business_debt_schedule.md` | Business Debt Schedule | Step 4 (Financials) |
| `06_use_of_proceeds.md` | Use of Proceeds Statement | Step 3 (Loan Request) |
| `07_personal_financial_statement_413.md` | Personal Financial Statement (SBA Form 413 data) | Step 2 (Ownership) |
| `08_sba_form_1919_data.md` | SBA Form 1919 Borrower Data | Steps 1–2 |
| `09_management_resume_narrative.md` | Management Experience / Resume Narrative | Step 6 (Management) |
| `10_competitor_analysis.md` | Competitor and Market Analysis | Step 5 (Market) |
| `11_loan_cover_letter.md` | Loan Application Cover Letter | All steps |

---

## Placeholder Convention

All placeholders use the format: `[PLACEHOLDER_NAME]`

- **ALL_CAPS** = required field from user wizard input
- **Optional fields** are labeled in description (e.g., "if applicable", "add rows as needed")
- `[YES_NO]` = a boolean question requiring a Yes or No answer
- `[YES_NO_N]` = numbered boolean from a list of eligibility questions

---

## Wizard Step → Placeholder Mapping

| Wizard Step | Key Placeholders Filled |
|---|---|
| Step 1: Business Identity | `[BUSINESS_LEGAL_NAME]`, `[BUSINESS_DBA_NAME]`, `[ENTITY_TYPE]`, `[EIN]`, `[STATE]`, `[YEAR_FOUNDED]`, `[INDUSTRY]`, `[NAICS_CODE]`, `[BUSINESS_ADDRESS]`, `[BUSINESS_PHONE]`, `[BUSINESS_EMAIL]`, `[BUSINESS_WEBSITE]` |
| Step 2: Ownership & Borrower Info | `[OWNER_NAME_*]`, `[OWNERSHIP_PERCENT_*]`, `[OWNER_TITLE_*]`, `[OWNER_DOB]`, `[OWNER_HOME_ADDRESS]`, `[SSN — encrypted]`, `[CITIZENSHIP_STATUS_*]`, `[ASSOCIATE_*]` |
| Step 3: Loan Request | `[LOAN_AMOUNT]`, `[LOAN_TYPE]`, `[LOAN_TERM_YEARS]`, `[LOAN_PURPOSE_*]`, `[USE_CATEGORY_*]`, `[USE_AMOUNT_*]`, `[COLLATERAL_*]`, `[EQUITY_SOURCE_*]` |
| Step 4: Financial Snapshot | All revenue, COGS, expense, income, asset, liability, debt, and projection fields |
| Step 5: Market & Competition | `[INDUSTRY]`, `[GEOGRAPHIC_MARKET]`, `[TARGET_MARKET_*]`, `[COMPETITOR_*]`, `[MARKET_*]` |
| Step 6: Management & Experience | `[OWNER_PROFESSIONAL_SUMMARY_*]`, `[CAREER_HISTORY_*]`, `[EDUCATION_*]`, `[ACCOMPLISHMENTS_*]` |
| Step 7: Review & Generate | All fields reviewed; document generation triggered; export gated by Stripe payment |

---

## Notes for Development

- SSN and other high-sensitivity fields should **never** appear in plaintext in generated documents — use a masked reference or omit entirely and note "collected securely"
- All dollar amounts should be formatted with `$` prefix and comma separators on export
- Projections marked clearly as "estimates" — include standard PrepSBA disclaimer on every document
- Templates should be versioned alongside prompt versions in the AI generation service

---

*Templates prepared by Max (PrepSBA AI agent). For internal use only.*
