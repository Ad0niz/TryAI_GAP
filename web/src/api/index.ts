/** Auth endpoints (magic-link flow) + domain endpoints used by the app shell. */
import { api, apiBlob, tokenStorage } from './client';
import type {
  AnswerListResponse,
  AreaActivateResponse,
  AreaListResponse,
  AssessmentSummary,
  BatchAnswerItem,
  BatchAnswerResult,
  CasesResponse,
  CheckoutSessionCreate,
  CheckoutSessionResponse,
  ConsultantClientDetail,
  ConsultantClientItem,
  ConsultantKpis,
  ConsultantNoteOut,
  DelegateCreate,
  DelegateResponse,
  DelegationAnswerOut,
  DelegationInfo,
  DocumentCreateResponse,
  DocumentListItem,
  DistributorCodeValidateResponse,
  InvitationCreate,
  InvitationResponse,
  LeadCreate,
  LeadCreateResponse,
  LogoResponse,
  MagicLinkResponse,
  MeResponse,
  OrgUpdate,
  Organization,
  Page,
  PaymentOut,
  PricingResponse,
  QuestionnaireOut,
  QuoteCreate,
  QuoteResponse,
  RatingCreate,
  RatingOut,
  ResultOut,
  ReviewCreate,
  ReviewCreateOut,
  ReviewOut,
  TeamListResponse,
  TokenPair,
  VerifyResponse,
} from './types';

// ---------- auth ----------
export function requestMagicLink(email: string, locale: string): Promise<MagicLinkResponse> {
  return api<MagicLinkResponse>('/auth/magic-link', {
    method: 'POST',
    body: { email, locale },
    auth: false,
  });
}

export function verifyMagicLink(token: string): Promise<VerifyResponse> {
  return api<VerifyResponse>('/auth/verify', { method: 'POST', body: { token }, auth: false });
}

export function refreshTokens(refreshToken: string): Promise<TokenPair> {
  return api<TokenPair>('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    auth: false,
  });
}

export async function logoutRequest(): Promise<void> {
  const refreshToken = tokenStorage.getRefresh();
  await api<void>('/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken, all: false },
  });
}

export function fetchMe(): Promise<MeResponse> {
  return api<MeResponse>('/auth/me');
}

// ---------- organizations ----------
export function fetchOrganization(orgId: string): Promise<Organization> {
  return api<Organization>(`/organizations/${orgId}`);
}

export function updateOrganization(orgId: string, payload: OrgUpdate): Promise<Organization> {
  return api<Organization>(`/organizations/${orgId}`, { method: 'PATCH', body: payload });
}

export function uploadOrgLogo(orgId: string, file: File): Promise<LogoResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return api<LogoResponse>(`/organizations/${orgId}/logo`, { method: 'POST', formData });
}

// ---------- metadata (localized catalogs) ----------
export interface MetadataResponse {
  sizes: string[];
  industries: string[];
  countries: string[];
  currencies: string[];
  frameworks: string[];
}

export function fetchMetadata(): Promise<MetadataResponse> {
  return api<MetadataResponse>('/metadata', { auth: false });
}

// ---------- leads (public signup → org + assessment + tokens) ----------
export function createLead(payload: LeadCreate): Promise<LeadCreateResponse> {
  return api<LeadCreateResponse>('/leads', { method: 'POST', body: payload, auth: false });
}

// ---------- assessments / answers ----------
export function fetchCurrentAssessment(): Promise<AssessmentSummary> {
  return api<AssessmentSummary>('/assessments/current');
}

export function fetchAssessment(assessmentId: string): Promise<AssessmentSummary> {
  return api<AssessmentSummary>(`/assessments/${assessmentId}`);
}

export function fetchAnswers(
  assessmentId: string,
  filter: { module?: string; areaKey?: string } = {},
): Promise<AnswerListResponse> {
  const params = new URLSearchParams();
  if (filter.module) params.set('module', filter.module);
  if (filter.areaKey) params.set('area_key', filter.areaKey);
  const qs = params.toString();
  return api<AnswerListResponse>(`/assessments/${assessmentId}/answers${qs ? `?${qs}` : ''}`);
}

/** Batch upsert: {answers: [{question_id, value?, state?}]} → {saved, failed[]}. */
export function saveAnswersBatch(
  assessmentId: string,
  answers: BatchAnswerItem[],
): Promise<BatchAnswerResult> {
  return api<BatchAnswerResult>(`/assessments/${assessmentId}/answers:batch`, {
    method: 'POST',
    body: { answers },
  });
}

/** Delegate a single question by email (sends a magic answer link). */
export function delegateQuestion(
  assessmentId: string,
  questionId: string,
  payload: DelegateCreate,
): Promise<DelegateResponse> {
  return api<DelegateResponse>(
    `/assessments/${assessmentId}/questions/${questionId}/delegate`,
    { method: 'POST', body: payload },
  );
}

// ---------- areas ----------
export function fetchAreas(assessmentId: string): Promise<AreaListResponse> {
  return api<AreaListResponse>(`/assessments/${assessmentId}/areas`);
}

export function activateArea(assessmentId: string, areaKey: string): Promise<AreaActivateResponse> {
  return api<AreaActivateResponse>(`/assessments/${assessmentId}/areas/${areaKey}:activate`, {
    method: 'POST',
  });
}

export function deactivateArea(assessmentId: string, areaKey: string): Promise<void> {
  return api<void>(`/assessments/${assessmentId}/areas/${areaKey}`, { method: 'DELETE' });
}

/** Static per-area use-case catalog (read-only; localized via Accept-Language). */
export function fetchAreaCases(areaKey: string): Promise<CasesResponse> {
  return api<CasesResponse>(`/areas/${areaKey}/cases`);
}

// ---------- questionnaires ----------
export function fetchQuestionnaire(module: string, areaKey?: string): Promise<QuestionnaireOut> {
  const params = new URLSearchParams({ module });
  if (areaKey) params.set('area_key', areaKey);
  return api<QuestionnaireOut>(`/questionnaires?${params.toString()}`);
}

// ---------- team / invitations ----------
export function fetchTeam(): Promise<TeamListResponse> {
  return api<TeamListResponse>('/team');
}

export function createInvitation(payload: InvitationCreate): Promise<InvitationResponse> {
  return api<InvitationResponse>('/invitations', { method: 'POST', body: payload });
}

export function resendInvitation(invitationId: string) {
  return api<{ invitation_id: string; status: string }>(`/invitations/${invitationId}/resend`, {
    method: 'POST',
  });
}

export function deleteInvitation(invitationId: string): Promise<void> {
  return api<void>(`/invitations/${invitationId}`, { method: 'DELETE' });
}

// ---------- documents ----------
export function uploadDocument(
  file: File,
  link: { assessmentId: string; areaKey?: string; questionId?: string },
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('assessment_id', link.assessmentId);
  if (link.areaKey) formData.append('area_key', link.areaKey);
  if (link.questionId) formData.append('question_id', link.questionId);
  return api<DocumentCreateResponse>('/documents', { method: 'POST', formData });
}

export function fetchDocuments(
  page = 1,
  filter: { assessmentId?: string; areaKey?: string } = {},
): Promise<Page<DocumentListItem>> {
  const params = new URLSearchParams({ page: String(page) });
  if (filter.assessmentId) params.set('assessment_id', filter.assessmentId);
  if (filter.areaKey) params.set('area_key', filter.areaKey);
  return api<Page<DocumentListItem>>(`/documents?${params.toString()}`);
}

export function deleteDocument(documentId: string): Promise<void> {
  return api<void>(`/documents/${documentId}`, { method: 'DELETE' });
}

/** Authenticated binary download of a document (dev: local storage stream). */
export function downloadDocument(documentId: string): Promise<Blob> {
  return apiBlob(`/documents/${documentId}/download`);
}

// ---------- estimator / payments ----------
export function fetchPricing(): Promise<PricingResponse> {
  return api<PricingResponse>('/pricing');
}

export function createQuote(payload: QuoteCreate): Promise<QuoteResponse> {
  return api<QuoteResponse>('/estimator/quote', { method: 'POST', body: payload });
}

export function validateDistributorCode(code: string): Promise<DistributorCodeValidateResponse> {
  return api<DistributorCodeValidateResponse>('/distributor-codes/validate', {
    method: 'POST',
    body: { code },
  });
}

export function createCheckoutSession(
  payload: CheckoutSessionCreate,
  idempotencyKey: string,
): Promise<CheckoutSessionResponse> {
  return api<CheckoutSessionResponse>('/payments/checkout-session', {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function fetchPayment(paymentId: string): Promise<PaymentOut> {
  return api<PaymentOut>(`/payments/${paymentId}`);
}

/**
 * DEV-ONLY simulated payment: the mock Stripe checkout never reaches a real
 * webhook, so the simulated checkout page posts the completion event itself
 * (the dev backend trusts unsigned webhook payloads).
 */
export function postMockStripeWebhook(paymentId: string, providerRef: string): Promise<{ received: boolean }> {
  return api<{ received: boolean }>('/webhooks/stripe', {
    method: 'POST',
    auth: false,
    body: {
      id: `evt_mock_${paymentId}`,
      type: 'checkout.session.completed',
      data: { object: { id: providerRef, metadata: { payment_id: paymentId } } },
    },
  });
}

// ---------- results / reviews ----------
export function fetchResults(assessmentId: string): Promise<ResultOut> {
  return api<ResultOut>(`/results/${assessmentId}`);
}

export function createReview(payload: ReviewCreate): Promise<ReviewCreateOut> {
  return api<ReviewCreateOut>('/reviews', { method: 'POST', body: payload });
}

export function fetchReview(reviewId: string): Promise<ReviewOut> {
  return api<ReviewOut>(`/reviews/${reviewId}`);
}

export function submitReviewRating(reviewId: string, payload: RatingCreate): Promise<RatingOut> {
  return api<RatingOut>(`/reviews/${reviewId}/ratings`, { method: 'POST', body: payload });
}

// ---------- consultant console (role=consultant) ----------
export function fetchConsultantKpis(): Promise<ConsultantKpis> {
  return api<ConsultantKpis>('/consultant/kpis');
}

export function fetchConsultantClients(
  filter: { status?: string; plan?: string; page?: number } = {},
): Promise<Page<ConsultantClientItem>> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.plan) params.set('plan', filter.plan);
  params.set('page', String(filter.page ?? 1));
  return api<Page<ConsultantClientItem>>(`/consultant/clients?${params.toString()}`);
}

export function fetchConsultantClient(clientId: string): Promise<ConsultantClientDetail> {
  return api<ConsultantClientDetail>(`/consultant/clients/${clientId}`);
}

export function createConsultantNote(clientId: string, body: string): Promise<ConsultantNoteOut> {
  return api<ConsultantNoteOut>(`/consultant/clients/${clientId}/notes`, {
    method: 'POST',
    body: { body },
  });
}

// ---------- public delegation page (no auth) ----------
export function fetchDelegation(token: string): Promise<DelegationInfo> {
  return api<DelegationInfo>(`/delegations/${token}`, { auth: false });
}

export function answerDelegation(token: string, value: number): Promise<DelegationAnswerOut> {
  return api<DelegationAnswerOut>(`/delegations/${token}/answer`, {
    method: 'POST',
    body: { value },
    auth: false,
  });
}
