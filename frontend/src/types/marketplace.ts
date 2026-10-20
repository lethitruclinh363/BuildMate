export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface PublicContractorProfile {
  id: string;
  contractorId: string;
  displayName: string;
  slogan: string;
  description: string;
  phone: string;
  address: string;
  city: string;
  avatar: string;
  logo: string;
  coverImage: string;
  gallery: string[];
  crewPhotos: string[];
  publicCertificates: string[];
  achievements: string;
  openingHours: string;
  serviceAreas: string[];
  yearsExperience: number;
  workerCount: number;
  serviceRadiusKm?: number;
  areaCenter?: { lat: number; lng: number } | null;
  locationReady?: boolean;
  locationSource?: 'VIETMAP_PLACE' | 'GPS' | 'MANUAL_PIN' | '';
  verified: boolean;
  rating: number;
  reviewCount: number;
}

export interface PublicStoreProfile {
  id: string;
  contractorId: string;
  profileType?: 'STORE' | 'CONTRACTOR';
  displayName: string;
  slogan: string;
  description: string;
  phone: string;
  contactName?: string;
  contactEmail?: string;
  address: string;
  city: string;
  avatar: string;
  logo: string;
  coverImage: string;
  gallery: string[];
  openingHours: string;
  serviceAreas: string[];
  serviceRadiusKm?: number;
  deliveryEnabled?: boolean;
  baseDeliveryFee?: number;
  freeDeliveryRadiusKm?: number;
  deliveryFeePerKm?: number;
  minimumOrderAmount?: number;
  yearsExperience?: number;
  areaCenter?: { lat: number; lng: number } | null;
  locationReady?: boolean;
  locationSource?: 'VIETMAP_PLACE' | 'GPS' | 'MANUAL_PIN' | '';
  showroomNote?: string;
  deliveryNote?: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
}

export interface PublicStoreReview {
  id: string;
  rating: number;
  comment: string;
  customerName?: string;
  createdAt?: string;
}

export interface PublicHighlights {
  completedProjects?: number;
  customersServed?: number;
  completionRate?: number;
  responseRate?: number;
  averageResponseMinutes?: number;
}

export interface NearbyPlace {
  id: string;
  contractorId: string;
  storeName: string;
  businessName: string;
  slogan: string;
  description?: string;
  address: string;
  city: string;
  phone: string;
  storeType: 'SERVICES' | 'MATERIALS' | 'BOTH';
  category: string;
  avatar?: string;
  logo?: string;
  coverImage: string;
  openingHours: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  reputationScore?: number | null;
  reputationGrade?: string | null;
  completedProjects?: number;
  distance: number;
  distanceMeters?: number;
  serviceRadiusKm?: number;
  deliveryEnabled?: boolean;
  baseDeliveryFee?: number;
  location: GeoPoint;
  services: { id: string; name: string; category: string; basePrice: number }[];
  products?: { id: string; name: string; category: string; price: number; unit: string }[];
  materialCategories?: { name: string; type?: 'SYSTEM' | 'CUSTOM' }[];
}

export interface PublicService {
  id: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  unit: string;
  estimatedHours: number;
  image: string;
  images: string[];
  isActive: boolean;
  store?: { id: string; name: string; address: string; city: string; coverImage: string } | null;
}

export interface PublicMaterial {
  id: string;
  name: string;
  category: string;
  sku: string;
  unit: string;
  price: number;
  stock: number;
  image: string;
  images: string[];
  description: string;
  listingStatus?: 'ACTIVE' | 'PAUSED' | 'DISCONTINUED';
  saleAvailability?: 'AVAILABLE' | 'MANUALLY_UNAVAILABLE';
  saleState?: 'selling' | 'out' | 'paused' | 'discontinued';
  isActive?: boolean;
  store?: { id: string; name: string; address: string; city: string; coverImage: string } | null;
}

export const CAN_THO = { lat: 10.045, lng: 105.746 };

export const SEARCH_CHIPS = [
  { labelKey: 'explore.chipElectric', category: 'Electrical' },
  { labelKey: 'explore.chipPaint', category: 'Painting' },
  { labelKey: 'explore.chipWaterproof', category: 'Waterproofing' },
] as const;
