from pydantic import BaseModel
from typing import List, Optional


class PhasePick(BaseModel):
    id: str
    type: str  # 'P' or 'S'
    time: float
    confidence: float
    method: str


class Station(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    elevation: float


class SeismicEvent(BaseModel):
    id: str
    magnitude: float
    depth: float
    origin_time: str
    location: str


class QualityIssue(BaseModel):
    code: str
    severity: str  # 'low', 'medium', 'high', 'critical'
    description: str
    suggestion: Optional[str] = None


class WaveformQuality(BaseModel):
    overall_score: float
    grade: str  # 'A', 'B', 'C', 'D', 'F'
    usability: str  # 'excellent', 'good', 'fair', 'poor', 'unusable'
    snr: float
    noise_level: float
    data_completeness: float
    amplitude_range: float
    clip_ratio: float
    issues: List[QualityIssue]
