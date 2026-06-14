import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { WaveformData, PhasePick, Station, SeismicEvent, WaveformQuality, QualityIssue } from '../types'

export const useSeismicStore = defineStore('seismic', () => {
  const waveform = ref<WaveformData | null>(null)
  const picks = ref<PhasePick[]>([])
  const quality = ref<WaveformQuality | null>(null)
  const selectedStation = ref<Station | null>(null)
  const staWindow = ref(1.0)
  const ltaWindow = ref(10.0)
  const threshold = ref(3.5)
  const isLoading = ref(false)
  const events = ref<SeismicEvent[]>([
    { id: '1', magnitude: 4.2, depth: 12.5, originTime: '2025-01-15T08:23:41Z', location: '四川雅安' },
    { id: '2', magnitude: 3.8, depth: 8.3, originTime: '2025-01-14T14:12:05Z', location: '云南大理' },
    { id: '3', magnitude: 5.1, depth: 25.0, originTime: '2025-01-13T02:45:33Z', location: '台湾花莲' },
  ])

  const stations = ref<Station[]>([
    { id: 'STA01', name: 'BJI', latitude: 39.9, longitude: 116.4, elevation: 45 },
    { id: 'STA02', name: 'SSE', latitude: 31.2, longitude: 121.5, elevation: 10 },
    { id: 'STA03', name: 'KMI', latitude: 25.0, longitude: 102.7, elevation: 1890 },
    { id: 'STA04', name: 'HIA', latitude: 49.3, longitude: 119.7, elevation: 610 },
  ])

  function generateMockWaveform(): WaveformData {
    const sr = 100
    const duration = 60
    const n = sr * duration
    const time = Array.from({ length: n }, (_, i) => i / sr)
    const bhz: number[] = [], bhn: number[] = [], bhe: number[] = []

    for (let i = 0; i < n; i++) {
      const t = time[i]
      let vz = (Math.random() - 0.5) * 0.02
      let ns = (Math.random() - 0.5) * 0.02
      let ew = (Math.random() - 0.5) * 0.02

      if (t > 10 && t < 18) {
        const amp = 0.8 * Math.exp(-(t - 12) * (t - 12) / 8)
        vz += amp * Math.sin(2 * Math.PI * 8 * t)
        ns += amp * 0.3 * Math.sin(2 * Math.PI * 8 * t + 0.5)
        ew += amp * 0.3 * Math.sin(2 * Math.PI * 8 * t + 1.0)
      }

      if (t > 22 && t < 40) {
        const amp = 1.5 * Math.exp(-(t - 28) * (t - 28) / 30)
        vz += amp * 0.4 * Math.sin(2 * Math.PI * 4 * t)
        ns += amp * Math.sin(2 * Math.PI * 4 * t + 0.3)
        ew += amp * Math.sin(2 * Math.PI * 4 * t + 0.8)
      }

      if (t > 35 && t < 55) {
        const amp = 2.0 * Math.exp(-(t - 42) * (t - 42) / 50)
        vz += amp * Math.sin(2 * Math.PI * 1.5 * t)
        ns += amp * Math.sin(2 * Math.PI * 1.5 * t + 0.4)
        ew += amp * Math.sin(2 * Math.PI * 1.5 * t + 0.9)
      }

      bhz.push(vz)
      bhn.push(ns)
      bhe.push(ew)
    }

    return { time, bhz, bhn, bhe, samplingRate: sr }
  }

  function _std(arr: number[]): number {
    if (arr.length === 0) return 0
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length
    const variance = arr.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / arr.length
    return Math.sqrt(variance)
  }

  function _rms(arr: number[]): number {
    if (arr.length === 0) return 0
    const sq = arr.reduce((acc, v) => acc + v * v, 0) / arr.length
    return Math.sqrt(sq)
  }

  function assessWaveformQuality(wf: WaveformData): WaveformQuality {
    const issues: QualityIssue[] = []
    const sr = wf.samplingRate
    const components: ('bhz' | 'bhn' | 'bhe')[] = ['bhz', 'bhn', 'bhe']
    const snrList: number[] = []
    const noiseList: number[] = []
    const completenessList: number[] = []
    const clipList: number[] = []
    const ampRangeList: number[] = []

    for (const comp of components) {
      const data = wf[comp]
      if (!data || data.length === 0) {
        issues.push({
          code: `MISSING_${comp.toUpperCase()}`,
          severity: 'critical',
          description: `${comp.toUpperCase()} 分量数据缺失`,
          suggestion: '请检查数据文件，确保包含完整的三分量数据'
        })
        continue
      }

      const noiseWindow = data.slice(0, sr * 2)
      const noiseStd = _std(noiseWindow)
      const signalStd = _std(data)
      const snr = noiseStd < 1e-10 ? 100 : (signalStd / noiseStd) ** 2
      snrList.push(snr)

      const noiseLevel = _rms(noiseWindow)
      noiseList.push(noiseLevel)

      const valid = data.filter(v => Number.isFinite(v)).length
      const completeness = valid / data.length
      completenessList.push(completeness)

      const absMax = Math.max(...data.map(v => Math.abs(v)))
      const clipped = data.filter(v => Math.abs(v) >= absMax * 0.99).length
      const clipRatio = absMax < 1e-10 ? 0 : clipped / data.length
      clipList.push(clipRatio)

      const ampRange = Math.max(...data) - Math.min(...data)
      ampRangeList.push(ampRange)

      if (completeness < 0.95) {
        issues.push({
          code: `INCOMPLETE_${comp.toUpperCase()}`,
          severity: 'high',
          description: `${comp.toUpperCase()} 分量数据不完整，有效率 ${(completeness * 100).toFixed(1)}%`,
          suggestion: '检查数据采集过程或文件传输是否丢包'
        })
      }

      if (clipRatio > 0.01) {
        issues.push({
          code: `CLIPPING_${comp.toUpperCase()}`,
          severity: clipRatio > 0.05 ? 'high' : 'medium',
          description: `${comp.toUpperCase()} 分量存在削波，削波占比 ${(clipRatio * 100).toFixed(2)}%`,
          suggestion: '降低采集增益或检查传感器量程设置'
        })
      }

      const meanVal = data.reduce((a, b) => a + b, 0) / data.length
      const dcOffset = signalStd < 1e-10 ? Math.abs(meanVal) : Math.abs(meanVal) / signalStd
      if (dcOffset > 0.5) {
        issues.push({
          code: `DC_OFFSET_${comp.toUpperCase()}`,
          severity: 'medium',
          description: `${comp.toUpperCase()} 分量存在直流偏移 (归一化 ${dcOffset.toFixed(2)})`,
          suggestion: '建议进行去趋势或高通滤波预处理'
        })
      }
    }

    const avgSnr = snrList.length ? snrList.reduce((a, b) => a + b, 0) / snrList.length : 0
    const avgNoise = noiseList.length ? noiseList.reduce((a, b) => a + b, 0) / noiseList.length : 0
    const avgCompleteness = completenessList.length ? completenessList.reduce((a, b) => a + b, 0) / completenessList.length : 0
    const avgClip = clipList.length ? clipList.reduce((a, b) => a + b, 0) / clipList.length : 0
    const avgAmp = ampRangeList.length ? ampRangeList.reduce((a, b) => a + b, 0) / ampRangeList.length : 0

    if (avgSnr < 2.0) {
      issues.push({
        code: 'LOW_SNR',
        severity: 'high',
        description: `整体信噪比过低 (SNR=${avgSnr.toFixed(2)})`,
        suggestion: '增强信号、降低噪声或更换低噪声传感器'
      })
    } else if (avgSnr < 5.0) {
      issues.push({
        code: 'LOW_SNR',
        severity: 'medium',
        description: `整体信噪比较低 (SNR=${avgSnr.toFixed(2)})`,
        suggestion: '可尝试使用带通滤波提高信噪比'
      })
    }

    if (avgNoise > 0.05) {
      issues.push({
        code: 'HIGH_NOISE',
        severity: 'medium',
        description: `背景噪声水平偏高 (RMS=${avgNoise.toFixed(4)})`,
        suggestion: '检查台站环境是否存在人为干扰源'
      })
    }

    let score = (
      Math.min(avgSnr / 20, 1) * 40 +
      avgCompleteness * 25 +
      (1 - Math.min(avgClip / 0.05, 1)) * 20 +
      Math.min(avgAmp / 5, 1) * 15
    )
    score = Math.max(0, Math.min(100, score))
    score = Math.round(score * 10) / 10

    let grade: WaveformQuality['grade'] = 'F'
    let usability: WaveformQuality['usability'] = 'unusable'
    if (score >= 85) {
      grade = 'A'
      usability = 'excellent'
    } else if (score >= 70) {
      grade = 'B'
      usability = 'good'
    } else if (score >= 55) {
      grade = 'C'
      usability = 'fair'
    } else if (score >= 40) {
      grade = 'D'
      usability = 'poor'
    }

    const severityRank: Record<QualityIssue['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 }
    issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

    return {
      overall_score: score,
      grade,
      usability,
      snr: Math.round(avgSnr * 100) / 100,
      noise_level: Math.round(avgNoise * 1e6) / 1e6,
      data_completeness: Math.round(avgCompleteness * 10000) / 10000,
      amplitude_range: Math.round(avgAmp * 1e6) / 1e6,
      clip_ratio: Math.round(avgClip * 10000) / 10000,
      issues
    }
  }

  function loadMockData() {
    waveform.value = generateMockWaveform()
    quality.value = waveform.value ? assessWaveformQuality(waveform.value) : null
    picks.value = [
      { id: 'p1', type: 'P', time: 10.2, confidence: 0.92, method: 'STA/LTA' },
      { id: 'p2', type: 'S', time: 22.5, confidence: 0.88, method: 'STA/LTA' },
    ]
  }

  function staLtaPicking(): PhasePick[] {
    if (!waveform.value) return []
    const data = waveform.value.bhz
    const sr = waveform.value.samplingRate
    const staLen = Math.floor(staWindow.value * sr)
    const ltaLen = Math.floor(ltaWindow.value * sr)
    const newPicks: PhasePick[] = []

    let lta = 0
    for (let i = ltaLen; i < data.length - staLen; i++) {
      let sta = 0
      for (let j = 0; j < staLen; j++) sta += data[i + j] * data[i + j]
      sta /= staLen

      lta = 0
      for (let j = 0; j < ltaLen; j++) lta += data[i - j] * data[i - j]
      lta /= ltaLen

      const ratio = lta > 0 ? sta / lta : 0
      if (ratio > threshold.value) {
        const t = waveform.value.time[i]
        const existsNear = newPicks.some(p => Math.abs(p.time - t) < 2)
        if (!existsNear) {
          newPicks.push({
            id: `pick_${Date.now()}_${i}`,
            type: newPicks.length === 0 ? 'P' : 'S',
            time: t,
            confidence: Math.min(1, ratio / 10),
            method: 'STA/LTA'
          })
        }
      }
    }
    return newPicks
  }

  async function uploadAndAnalyze(file: File) {
    isLoading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await fetch('/api/waveform/upload', { method: 'POST', body: formData })
      if (resp.ok) {
        const data = await resp.json()
        waveform.value = data.waveform
        quality.value = data.quality || (waveform.value ? assessWaveformQuality(waveform.value) : null)
        picks.value = data.picks || []
      }
    } catch {
      loadMockData()
    } finally {
      isLoading.value = false
    }
  }

  return {
    waveform, picks, quality, selectedStation, staWindow, ltaWindow, threshold,
    isLoading, events, stations,
    loadMockData, staLtaPicking, uploadAndAnalyze, generateMockWaveform,
    assessWaveformQuality
  }
})
