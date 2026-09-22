/**
 * TypeScript types for the TryAIGap backend API (FastAPI, /api/v1).
 * Hand-written from backend/app/schemas/*.py — keep in sync manually.
 */

// ---------- common ----------
export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export interface MessageResponse {
  status: string;
  message?: string | null;
}

/** Backend error envelope: { error: { code, message, field, request_id } } */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    field?: string | null;
    request_id?: string;
  };
}

export type Role = 'client' | 'consultant' | 'admin';
export type Locale = 'es' | 'en' | 'de' | 'pt';

// ---------- auth ----------
export interface MagicLinkRequest {
  email: string;
  locale?: string;
}

export interface MagicLinkResponse {
  status: string;
  message?: string | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserPublic {
  id: string;
  email: string;
  role: Role;
  locale: string;
}

export interface VerifyResponse extends TokenPair {
  user: UserPublic;
}

export interface MeResponse {
  id: string;
  email: string;
  full_name?: string | null;
  role: Role;
  locale: string;
  organization_id?: string | null;
}

// ---------- organizations ----------
export interface OrgSettings {
  doc_locale: string;
  theme: string;
  logo_url?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  sector?: string | null;
  size?: string | null;
  country?: string | null;
  currency: string;
  plan: string;
  settings: OrgSettings;
}

export interface OrgUpdate {
  name?: string;
  sector?: string;
  size?: string;
  country?: string;
  currency?: string;
  legal_name?: string;
  address?: string;
  tax_id?: string;
  doc_locale?: string;
  theme?: string;
}

export interface LogoResponse {
  logo_url?: string | null;
}

// ---------- assessments / answers ----------
export interface AssessmentProgress {
  maturity: number;
  areas_overall: number;
}

/** GET /assessments/{id} and GET /assessments/current payload. */
export interface AssessmentSummary {
  id: string;
  organization_id: string;
  plan: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  progress: AssessmentProgress;
  free_preview_reached: boolean;
}

// ---------- leads (public signup) ----------
export interface LeadCreate {
  full_name: string;
  job_title?: string | null;
  company_email: string;
  company_name: string;
  company_size?: string | null;
  industry?: string | null;
  country?: string | null;
  terms_accepted: boolean;
  locale?: string;
}

export interface LeadCreateResponse extends TokenPair {
  lead_id: string;
  organization_id: string;
  assessment_id: string;
  plan: string;
}

export interface AnswerUpdate {
  value?: number | null;
  state?: string;
}

export interface AnswerOut {
  question_id: string;
  value?: number | null;
  state: string;
  updated_at?: string | null;
}

export interface BatchAnswerItem {
  question_id: string;
  value?: number | null;
  state?: string | null;
}

export interface BatchAnswerRequest {
  answers: BatchAnswerItem[];
}

export interface BatchFailure {
  question_id: string;
  reason: string;
}

export interface BatchAnswerResult {
  saved: number;
  failed: BatchFailure[];
}

export interface AnswerListItem {
  question_id: string;
  code: string;
  value?: number | null;
  state: string;
}

export interface AnswerListResponse {
  items: AnswerListItem[];
  meta: { total: number };
}

// ---------- areas ----------
export interface AreaItem {
  area_key: string;
  name: string;
  active: boolean;
  progress: number;
  leader?: string | null;
  locked: boolean;
}

export interface AreaListResponse {
  items: AreaItem[];
}

export interface AreaActivateResponse {
  area_key: string;
  active: boolean;
  progress: number;
}

export interface CaseItem {
  name: string;
  family: string;
  kpi: string;
  effort: string;
  maturity: string;
  stage: string;
}

export interface CasesResponse {
  area_key: string;
  cases: CaseItem[];
}

// ---------- questionnaires ----------
export interface QuestionOut {
  id: string;
  code: string;
  text?: string | null;
}

export interface BlockOut {
  id: string;
  title?: string | null;
  dimension?: string | null;
  questions: QuestionOut[];
}

export interface QuestionnaireOut {
  module: string;
  locale: string;
  blocks: BlockOut[];
}

// ---------- documents ----------
export interface DocumentLink {
  area_key?: string | null;
  question_id?: string | null;
}

export interface DocumentCreateResponse {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  linked_to: DocumentLink;
}

export interface DocumentListItem {
  id: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  area_key?: string | null;
  question_id?: string | null;
  created_at?: string | null;
  uploaded_by_name?: string | null;
}

// ---------- team / invitations / delegations ----------
export interface TeamMemberOut {
  member_id: string;
  name?: string | null;
  email?: string | null;
  area_key?: string | null;
  role: string;
  status: string;
}

export interface InvitationOut {
  invitation_id: string;
  full_name: string;
  email: string;
  area_key?: string | null;
  status: string; // sent|accepted|expired
  created_at?: string | null;
}

export interface TeamListResponse {
  items: TeamMemberOut[];
  invitations: InvitationOut[];
}

export interface InvitationCreate {
  full_name: string;
  email: string;
  area_key?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
}

export interface InvitationResponse {
  invitation_id: string;
  status: string;
  email: string;
  area_key?: string | null;
}

export interface InvitationResendResponse {
  invitation_id: string;
  status: string;
}

export interface DelegateCreate {
  name: string;
  email: string;
}

export interface DelegateResponse {
  delegation_id: string;
  question_id: string;
  status: string;
  sent_to: string;
}

// ---------- estimator / quotes ----------
export interface PricingResponse {
  currency: string;
  base_price: number;
  area_review: number;
  support_session: number;
  final_report_validation: number;
}

export interface AreaConfig {
  area_key: string;
  active: boolean;
  review: boolean;
  sessions: number;
}

export interface QuoteCreate {
  areas: AreaConfig[];
  final_report: boolean;
  distributor_code?: string | null;
}

export interface QuoteLine {
  concept: string;
  amount: number;
}

export interface QuoteResponse {
  quote_id: string;
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
}

export interface DistributorCodeValidateResponse {
  valid: boolean;
  discount_pct: number;
}

// ---------- payments ----------
export interface CheckoutSessionCreate {
  quote_id: string;
  success_url?: string | null;
  cancel_url?: string | null;
}

export interface CheckoutSessionResponse {
  payment_id: string;
  provider: string;
  checkout_url: string;
  status: string;
}

export interface PaymentOut {
  payment_id: string;
  status: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
}

// ---------- results / reports ----------
export interface DimensionScore {
  key: string;
  label: string;
  score: number;
}

export interface MaturityBlock {
  average: number;
  level: string;
  dimensions: DimensionScore[];
}

export interface HeatmapArea {
  name: string;
  row: number[];
}

export interface HeatmapBlock {
  vectors: string[];
  areas: HeatmapArea[];
}

export interface PriorityItem {
  initiative: string;
  area: string;
  vector: string;
  pain: number;
  readiness: number;
  recommendation: string;
}

export interface ResultOut {
  maturity: MaturityBlock;
  heatmap: HeatmapBlock;
  priorities: PriorityItem[];
}

export interface ReportCreateOut {
  report_id: string;
  status: string;
}

export interface ReportOut {
  report_id: string;
  status: string;
  download_url?: string | null;
  expires_at?: string | null;
}

// ---------- reviews ----------
export interface ReviewCreate {
  assessment_id: string;
  mode: 'sync' | 'async';
}

export interface ReviewCreateOut {
  review_id: string;
  mode: string;
  stage: number;
}

export interface ChapterOut {
  chapter_key: string;
  validated: boolean;
  note?: string | null;
  validated_at?: string | null;
}

export interface ReviewOut {
  review_id: string;
  stage: number;
  consultant?: string | null;
  chapters: ChapterOut[];
}

export interface RatingCreate {
  chapter_key: string;
  knowledge?: number | null;
  friendliness?: number | null;
  methodology?: number | null;
  comments?: string | null;
}

export interface RatingOut {
  rating_id: string;
  average: number;
}

// ---------- consultant console ----------
export interface ConsultantKpis {
  leads: number;
  active_engagements: number;
  avg_maturity: number;
  free_to_paid_conversion_pct: number;
}

export interface ConsultantClientItem {
  client_id: string;
  name: string;
  sector?: string | null;
  plan: string;
  progress: number;
  maturity?: number | null;
  status: string;
  last_activity?: string | null;
}

export interface ConsultantClientDimension {
  label: string;
  score: number;
}

export interface ConsultantClientDetail {
  client_id: string;
  name: string;
  plan: string;
  status: string;
  progress: number;
  maturity?: number | null;
  dimensions: ConsultantClientDimension[];
}

export interface ConsultantNoteOut {
  note_id: string;
  created_at: string;
}

// ---------- public delegation page ----------
export interface DelegationInfo {
  delegate_name: string;
  question_code?: string | null;
  question_text?: string | null;
  status: string; // sent|answered|expired
  expires_at?: string | null;
}

export interface DelegationAnswerOut {
  status: string;
  question_code?: string | null;
}
