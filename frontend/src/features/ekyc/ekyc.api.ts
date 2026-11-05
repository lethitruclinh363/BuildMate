import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';

export type EkycStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'AI_CHECKING'
  | 'AI_PASSED'
  | 'AI_REVIEW_REQUIRED'
  | 'AI_FAILED'
  | 'SUBMITTED';

export interface EkycRecord {
  id: string | null;
  referenceCode: string;
  status: EkycStatus;
  ocr: {
    idNumber: string;
    fullName: string;
    dateOfBirth: string;
    gender: string;
    hometown: string;
    passed: boolean;
    errors: string[];
  };
  liveness: {
    passed: boolean;
    hasCenter: boolean;
    hasLeft: boolean;
    hasRight: boolean;
    hasUp: boolean;
    hasDown: boolean;
  };
  faceMatch: {
    decision: 'MATCH' | 'REVIEW_REQUIRED' | 'NOT_MATCH' | '';
    matched: boolean;
    distance: number | null;
    threshold: number | null;
  } | null;
  submittedAt: string | null;
  processedAt: string | null;
  retakeReason: string;
  attemptCount: number;
  frontDocumentId?: string | null;
  backDocumentId?: string | null;
  hasFront?: boolean;
  hasBack?: boolean;
}

export interface FaceCheck {
  passed?: boolean;
  ready?: boolean;
  code: string;
  reason?: string;
}

const slow = { timeout: 120000, silent: true as const };

function unwrap<T>(body: ApiResponse<T>) {
  return body.data;
}

export const ekycApi = {
  current: async () => unwrap((await api.get<ApiResponse<EkycRecord>>('/contractor/ekyc', { silent: true })).data),
  saveDocument: async (file: File, type: 'CCCD_FRONT' | 'CCCD_BACK') => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    return unwrap((await api.post<ApiResponse<EkycRecord>>('/contractor/ekyc/documents', form, slow)).data);
  },
  readiness: async (file: File) => {
    const form = new FormData();
    form.append('selfie_image', file);
    return unwrap((await api.post<ApiResponse<FaceCheck>>('/contractor/ekyc/face/readiness', form, slow)).data);
  },
  validateFrame: async (frame: File, step: string, reference?: File | null, opposite?: File | null) => {
    const form = new FormData();
    form.append('frame_image', frame);
    form.append('step', step);
    if (reference) form.append('reference_image', reference);
    if (opposite) form.append('opposite_image', opposite);
    return unwrap((await api.post<ApiResponse<FaceCheck>>('/contractor/ekyc/face/validate-frame', form, slow)).data);
  },
  process: async (frames: Record<string, File>) => {
    const form = new FormData();
    form.append('selfie_image', frames.center);
    form.append('left_image', frames.left);
    form.append('right_image', frames.right);
    form.append('up_image', frames.up);
    form.append('down_image', frames.down);
    return unwrap(
      (await api.post<ApiResponse<EkycRecord>>('/contractor/ekyc/process', form, { timeout: 180000, silent: true })).data
    );
  },
  submit: async () => unwrap((await api.post<ApiResponse<EkycRecord>>('/contractor/ekyc/submit', {}, slow)).data),
  restart: async () => unwrap((await api.post<ApiResponse<EkycRecord>>('/contractor/ekyc/restart', {}, slow)).data),
  file: async (kind: 'front' | 'back' | 'center' | 'left' | 'right' | 'up' | 'down') => {
    const response = await api.get<Blob>(`/contractor/ekyc/files/${kind}`, { responseType: 'blob', silent: true });
    return URL.createObjectURL(response.data);
  },
};
