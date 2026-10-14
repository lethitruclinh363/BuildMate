export type ReputationGrade = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'AVERAGE' | 'NEEDS_IMPROVEMENT';

export interface ReputationSnapshot {
  published: boolean;
  score: number | null;
  grade: ReputationGrade | null;
  updatedAt: string | null;
  status: 'READY' | 'INSUFFICIENT';
  validOrders: number;
  requirements: { minOrders: number; minReviews: number };
  reviews: { count: number; average: number | null; sufficient: boolean };
  completion: {
    completed: number;
    contractorCancelled: number;
    customerCancelled: number;
    percent: number | null;
    sufficient: boolean;
  };
  onTime: { onTime: number; late: number; percent: number | null; sufficient: boolean };
  complaints: { upheld: number; dismissed: number; open: number; percent: number | null; sufficient: boolean };
}
