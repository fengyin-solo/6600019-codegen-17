export interface WaveformData {
  time: number[]
  bhz: number[]
  bhn: number[]
  bhe: number[]
  samplingRate: number
}

export interface PhasePick {
  id: string
  type: 'P' | 'S'
  time: number
  confidence: number
  method: string
}

export interface Station {
  id: string
  name: string
  latitude: number
  longitude: number
  elevation: number
}

export interface SeismicEvent {
  id: string
  magnitude: number
  depth: number
  originTime: string
  location: string
}

export interface QualityIssue {
  code: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  suggestion?: string
}

export interface WaveformQuality {
  overall_score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  usability: 'excellent' | 'good' | 'fair' | 'poor' | 'unusable'
  snr: number
  noise_level: number
  data_completeness: number
  amplitude_range: number
  clip_ratio: number
  issues: QualityIssue[]
}
