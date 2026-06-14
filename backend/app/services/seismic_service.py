"""Seismic waveform processing service."""
import numpy as np
from typing import List, Dict, Any


def generate_mock_waveform(duration: int = 60, sr: int = 100) -> Dict[str, Any]:
    """Generate synthetic seismic waveform with P and S arrivals."""
    n = sr * duration
    t = np.linspace(0, duration, n)

    # Background noise
    bhz = np.random.normal(0, 0.01, n)
    bhn = np.random.normal(0, 0.01, n)
    bhe = np.random.normal(0, 0.01, n)

    # P-wave (t=10s, 8Hz)
    p_mask = (t > 10) & (t < 18)
    p_amp = 0.8 * np.exp(-((t[p_mask] - 12) ** 2) / 8)
    bhz[p_mask] += p_amp * np.sin(2 * np.pi * 8 * t[p_mask])

    # S-wave (t=22s, 4Hz)
    s_mask = (t > 22) & (t < 40)
    s_amp = 1.5 * np.exp(-((t[s_mask] - 28) ** 2) / 30)
    bhe[s_mask] += s_amp * np.sin(2 * np.pi * 4 * t[s_mask])

    return {
        "time": t.tolist(),
        "bhz": bhz.tolist(),
        "bhn": bhn.tolist(),
        "bhe": bhe.tolist(),
        "samplingRate": sr,
    }


def sta_lta_pick(data: List[float], sr: int,
                 sta_sec: float = 1.0, lta_sec: float = 10.0,
                 threshold: float = 3.5) -> List[Dict[str, Any]]:
    """STA/LTA automatic phase picker."""
    arr = np.array(data)
    sta_len = int(sta_sec * sr)
    lta_len = int(lta_sec * sr)

    # Compute STA/LTA ratio
    sq = arr ** 2
    sta = np.convolve(sq, np.ones(sta_len) / sta_len, mode='valid')
    lta = np.convolve(sq, np.ones(lta_len) / lta_len, mode='valid')

    # Align lengths
    min_len = min(len(sta), len(lta))
    sta = sta[:min_len]
    lta = lta[:min_len]

    ratio = np.where(lta > 0, sta / lta, 0)
    picks = []
    last_pick = -999

    for i in range(len(ratio)):
        if ratio[i] > threshold and (i / sr - last_pick) > 2:
            t = (i + lta_len) / sr
            picks.append({
                "id": f"pick_{i}",
                "type": "P" if not picks else "S",
                "time": round(t, 2),
                "confidence": round(min(1.0, ratio[i] / 10), 2),
                "method": "STA/LTA",
            })
            last_pick = t

    return picks


def _compute_snr(data: np.ndarray, sr: int) -> float:
    """Estimate signal-to-noise ratio using early-window noise and whole-signal variance."""
    n = len(data)
    if n < sr * 3:
        return 0.0
    noise_window = data[:sr * 2]
    noise_std = np.std(noise_window)
    signal_std = np.std(data)
    if noise_std < 1e-10:
        return 100.0
    snr = (signal_std / noise_std) ** 2
    return float(round(snr, 2))


def _compute_noise_level(data: np.ndarray, sr: int) -> float:
    """Compute noise level as RMS of the first 2 seconds (presumed noise window)."""
    n = len(data)
    if n < sr * 2:
        noise_window = data
    else:
        noise_window = data[:sr * 2]
    rms = np.sqrt(np.mean(noise_window ** 2))
    return float(round(rms, 6))


def _compute_completeness(data: np.ndarray) -> float:
    """Ratio of non-NaN finite samples."""
    valid = np.isfinite(data)
    return float(round(valid.sum() / len(data), 4))


def _compute_clip_ratio(data: np.ndarray) -> float:
    """Detect clipping: ratio of samples at or near the maximum absolute value."""
    if len(data) == 0:
        return 0.0
    abs_max = np.max(np.abs(data))
    if abs_max < 1e-10:
        return 0.0
    clipped = np.abs(data) >= abs_max * 0.99
    return float(round(clipped.sum() / len(data), 4))


def _compute_amplitude_range(data: np.ndarray) -> float:
    """Peak-to-peak amplitude range."""
    if len(data) == 0:
        return 0.0
    return float(round(np.max(data) - np.min(data), 6))


def _detect_spikes(data: np.ndarray, sr: int, threshold: float = 5.0) -> int:
    """Count spikes: samples exceeding threshold * rolling median absolute deviation."""
    if len(data) < sr:
        return 0
    abs_data = np.abs(data)
    median = np.median(abs_data)
    mad = np.median(np.abs(abs_data - median))
    if mad < 1e-10:
        return 0
    spikes = abs_data > median + threshold * 1.4826 * mad
    return int(spikes.sum())


def _detect_dc_offset(data: np.ndarray, sr: int) -> float:
    """Detect DC offset normalized by signal std."""
    if len(data) == 0:
        return 0.0
    mean_val = np.mean(data)
    std_val = np.std(data)
    if std_val < 1e-10:
        return abs(mean_val) if mean_val != 0 else 0.0
    return float(round(abs(mean_val) / std_val, 4))


def assess_waveform_quality(waveform: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute a comprehensive waveform quality score across all three components.

    Metrics:
      - snr: signal-to-noise ratio (dB-style, higher is better)
      - noise_level: RMS noise
      - data_completeness: fraction of valid samples
      - amplitude_range: peak-to-peak range
      - clip_ratio: fraction of clipped samples
    """
    issues: List[Dict[str, Any]] = []
    components = ["bhz", "bhn", "bhe"]
    sr = waveform.get("samplingRate", 100)

    snr_list, noise_list, completeness_list = [], [], []
    clip_list, amp_range_list = [], []
    all_data = []

    for comp in components:
        raw = waveform.get(comp, [])
        arr = np.array(raw, dtype=np.float64)
        if len(arr) == 0:
            issues.append({
                "code": f"MISSING_{comp.upper()}",
                "severity": "critical",
                "description": f"{comp.upper()} 分量数据缺失",
                "suggestion": "请检查数据文件，确保包含完整的三分量数据"
            })
            continue

        all_data.append(arr)
        snr_list.append(_compute_snr(arr, sr))
        noise_list.append(_compute_noise_level(arr, sr))
        completeness_list.append(_compute_completeness(arr))
        clip_list.append(_compute_clip_ratio(arr))
        amp_range_list.append(_compute_amplitude_range(arr))

        if _compute_completeness(arr) < 0.95:
            issues.append({
                "code": f"INCOMPLETE_{comp.upper()}",
                "severity": "high",
                "description": f"{comp.upper()} 分量数据不完整，有效率 {_compute_completeness(arr)*100:.1f}%",
                "suggestion": "检查数据采集过程或文件传输是否丢包"
            })

        clip_r = _compute_clip_ratio(arr)
        if clip_r > 0.01:
            issues.append({
                "code": f"CLIPPING_{comp.upper()}",
                "severity": "high" if clip_r > 0.05 else "medium",
                "description": f"{comp.upper()} 分量存在削波，削波占比 {clip_r*100:.2f}%",
                "suggestion": "降低采集增益或检查传感器量程设置"
            })

        dc = _detect_dc_offset(arr, sr)
        if dc > 0.5:
            issues.append({
                "code": f"DC_OFFSET_{comp.upper()}",
                "severity": "medium",
                "description": f"{comp.upper()} 分量存在直流偏移 (归一化 {dc:.2f})",
                "suggestion": "建议进行去趋势或高通滤波预处理"
            })

        spikes = _detect_spikes(arr, sr)
        if spikes > len(arr) * 0.001:
            issues.append({
                "code": f"SPIKES_{comp.upper()}",
                "severity": "medium",
                "description": f"{comp.upper()} 分量检测到 {spikes} 个尖峰脉冲",
                "suggestion": "检查是否存在电磁干扰或传感器故障"
            })

    avg_snr = float(np.mean(snr_list)) if snr_list else 0.0
    avg_noise = float(np.mean(noise_list)) if noise_list else 0.0
    avg_completeness = float(np.mean(completeness_list)) if completeness_list else 0.0
    avg_clip = float(np.mean(clip_list)) if clip_list else 0.0
    avg_amp = float(np.mean(amp_range_list)) if amp_range_list else 0.0

    if avg_snr < 2.0:
        issues.append({
            "code": "LOW_SNR",
            "severity": "high",
            "description": f"整体信噪比过低 (SNR={avg_snr:.2f})",
            "suggestion": "增强信号、降低噪声或更换低噪声传感器"
        })
    elif avg_snr < 5.0:
        issues.append({
            "code": "LOW_SNR",
            "severity": "medium",
            "description": f"整体信噪比较低 (SNR={avg_snr:.2f})",
            "suggestion": "可尝试使用带通滤波提高信噪比"
        })

    if avg_noise > 0.05:
        issues.append({
            "code": "HIGH_NOISE",
            "severity": "medium",
            "description": f"背景噪声水平偏高 (RMS={avg_noise:.4f})",
            "suggestion": "检查台站环境是否存在人为干扰源"
        })

    score = (
        min(avg_snr / 20.0, 1.0) * 40 +
        avg_completeness * 25 +
        (1.0 - min(avg_clip / 0.05, 1.0)) * 20 +
        min(avg_amp / 5.0, 1.0) * 15
    )
    score = max(0.0, min(100.0, score))
    score = round(score, 1)

    if score >= 85:
        grade = "A"
        usability = "excellent"
    elif score >= 70:
        grade = "B"
        usability = "good"
    elif score >= 55:
        grade = "C"
        usability = "fair"
    elif score >= 40:
        grade = "D"
        usability = "poor"
    else:
        grade = "F"
        usability = "unusable"

    issues.sort(key=lambda x: {"critical": 0, "high": 1, "medium": 2, "low": 3}[x["severity"]])

    return {
        "overall_score": score,
        "grade": grade,
        "usability": usability,
        "snr": avg_snr,
        "noise_level": avg_noise,
        "data_completeness": avg_completeness,
        "amplitude_range": avg_amp,
        "clip_ratio": avg_clip,
        "issues": issues,
    }


def process_waveform(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Process uploaded waveform file.
    In production, use ObsPy to read SAC/miniSEED:
        from obspy import read
        st = read(BytesIO(file_bytes))
    """
    waveform = generate_mock_waveform()
    quality = assess_waveform_quality(waveform)
    picks = sta_lta_pick(waveform["bhz"], waveform["samplingRate"])
    return {"waveform": waveform, "quality": quality, "picks": picks}
