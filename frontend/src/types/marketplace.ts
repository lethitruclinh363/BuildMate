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
  verified: boolean;
  rating: number;
  reviewCount: number;
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
  completedProjects?: number;
  distance: number;
  location: GeoPoint;
  services: { id: string; name: string; category: string; basePrice: number }[];
  products?: { id: string; name: string; category: string; price: number; unit: string }[];
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
  store?: { id: string; name: string; address: string; city: string; coverImage: string } | null;
}

export const CAN_THO = { lat: 10.045, lng: 105.746 };

export const SEARCH_CHIPS = [
  { labelKey: 'explore.chipElectric', category: 'Electrical' },
  { labelKey: 'explore.chipPaint', category: 'Painting' },
  { labelKey: 'explore.chipWaterproof', category: 'Waterproofing' },
] as const;
