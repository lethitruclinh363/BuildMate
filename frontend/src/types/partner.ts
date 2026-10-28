export type VerificationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type DocumentType =
  | 'BUSINESS_LICENSE'
  | 'CERTIFICATE'
  | 'CCCD_FRONT'
  | 'CCCD_BACK'
  | 'ID_CARD'
  | 'STORE_IMAGE'
  | 'PORTFOLIO';

export interface VerificationDocument {
  _id: string;
  type: DocumentType;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface PortfolioProject {
  id: string;
  serviceId: string;
  serviceNameSnapshot: string;
  description: string;
  images: string[];
}

export interface ContractorProfile {
  id: string;
  userId: string;
  businessName: string;
  representativeName?: string;
  contactPhone?: string;
  contactEmail?: string;
  workerCount?: number;
  taxCode: string;
  address: string;
  city: string;
  lat?: number | null;
  lng?: number | null;
  locationConfirmed?: boolean;
  locationConfirmedAt?: string | null;
  locationSource?: 'VIETMAP_PLACE' | 'VIETMAP_AUTOCOMPLETE' | 'GPS' | 'MANUAL_PIN' | 'MAP_PIN' | string | null;
  providerRefId?: string | null;
  description: string;
  yearsExperience: number;
  serviceAreas: string[];
  materialCategories?: {
    name: string;
    type?: 'SYSTEM' | 'CUSTOM';
    categoryId?: string | null;
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
  }[];
  services?: {
    category: string;
    name: string;
    type?: 'SYSTEM' | 'CUSTOM';
    serviceId?: string | null;
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
  }[];
  portfolio?: {
    avatar: string;
    teamLogo: string;
    workshop: string;
    construction: string[];
    certificates: string[];
    projects?: PortfolioProject[];
  };
  completedSteps?: boolean[];
  verificationStatus: VerificationStatus;
  documents: VerificationDocument[];
  rejectionReason: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Storefront {
  id: string;
  contractorId: string;
  name: string;
  slogan: string;
  description: string;
  phone: string;
  address: string;
  city: string;
  storeType: 'SERVICES' | 'MATERIALS' | 'BOTH';
  coverImage: string;
  gallery: string[];
  openingHours: string;
  serviceRadiusKm: number;
  deliveryEnabled?: boolean;
  baseDeliveryFee?: number;
  freeDeliveryRadiusKm?: number;
  deliveryFeePerKm?: number;
  minimumOrderAmount?: number;
  deliveryNote?: string;
  category?: string;
  verified?: boolean;
  rating?: number;
  reviewCount?: number;
  status: 'DRAFT' | 'LIVE' | 'PAUSED';
  location: { type: 'Point'; coordinates: [number, number] };
}

export interface CatalogService {
  id: string;
  name: string;
  category: string;
  description: string;
  catalogKey?: string;
  catalogType?: 'SYSTEM' | 'CUSTOM' | 'LEGACY';
  completionStatus?: 'INCOMPLETE' | 'COMPLETED' | 'PENDING_APPROVAL';
  basePrice: number | null;
  unit: 'JOB' | 'HOUR' | 'M2' | 'DAY';
  estimatedHours: number | null;
  image: string;
  isActive: boolean;
}

export interface CatalogMaterial {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  sku: string;
  unit: string;
  price: number;
  stock: number;
  minOrderQty: number;
  image: string;
  images?: string[];
  description: string;
  isActive: boolean;
  listingStatus?: 'ACTIVE' | 'PAUSED' | 'DISCONTINUED';
  saleAvailability?: 'AVAILABLE' | 'MANUALLY_UNAVAILABLE';
  restockExpectedOn?: string | null;
  statusNote?: string;
  saleState?: 'selling' | 'out' | 'paused' | 'discontinued';
  createdAt?: string;
}

export interface StoreMaterialCategory {
  id: string;
  name: string;
  description: string;
  image: string;
  type: 'SYSTEM' | 'CUSTOM';
  status: 'ACTIVE' | 'INACTIVE';
  productCount: number;
  createdAt?: string | null;
}

export interface ActivationCheck {
  key: string;
  ok: boolean;
}

export interface ActivationReadiness {
  kind: 'CONTRACTOR' | 'STORE';
  checks: ActivationCheck[];
  profileReady: boolean;
  percent: number;
  activationStatus: 'INACTIVE' | 'LIVE' | 'PAUSED';
  verificationStatus: string;
  visible: boolean;
  ready: boolean;
}

export interface WorkspacePayload {
  profile: ContractorProfile;
  store: Storefront | null;
  stats: { services: number; documents: number };
  activation?: ActivationReadiness;
}

export interface PartnerApplication extends ContractorProfile {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    avatar: string;
    status: string;
  } | null;
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  CCCD_FRONT: 'Citizen ID front',
  CCCD_BACK: 'Citizen ID back',
  BUSINESS_LICENSE: 'Business license',
  CERTIFICATE: 'Certificate',
  ID_CARD: 'Owner ID',
  STORE_IMAGE: 'Yard / store photo',
  PORTFOLIO: 'Portfolio',
};

export const SERVICE_CATEGORIES = [
  'Waterproofing',
  'Electrical',
  'Plumbing',
  'Painting',
  'Masonry',
  'Interior',
  'General repair',
];

export const MATERIAL_CATEGORIES = [
  'Cement',
  'Paint',
  'Pipe',
  'Tiles',
  'Steel',
  'Waterproof coat',
  'Tools',
  'Fixtures',
];
