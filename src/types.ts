export interface CallAnalytic {
  callId: string;
  subscriberEmail: string;
  timestamp: string; // Consider using Date type after fetching
  duration: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  detectedLanguage: string;
  transcript: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label?: string;
    data: number[];
    backgroundColor: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }[];
}
