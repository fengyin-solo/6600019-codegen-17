<template>
  <div v-if="quality" class="bg-gray-800 rounded-xl p-3 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-cyan-300 font-bold text-sm">波形质量评分</h3>
      <span
        class="w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg"
        :class="gradeClass"
      >
        {{ quality.grade }}
      </span>
    </div>

    <div class="flex items-center gap-3">
      <div class="flex-1">
        <div class="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :style="{ width: `${quality.overall_score}%`, backgroundColor: scoreColor }"
          ></div>
        </div>
      </div>
      <span class="text-sm font-mono font-bold" :class="textColor">{{ quality.overall_score.toFixed(1) }}</span>
    </div>

    <div class="grid grid-cols-2 gap-2 text-xs">
      <div class="bg-gray-700 rounded p-2">
        <div class="text-gray-400">可用程度</div>
        <div class="font-bold" :class="textColor">{{ usabilityLabel }}</div>
      </div>
      <div class="bg-gray-700 rounded p-2">
        <div class="text-gray-400">信噪比 (SNR)</div>
        <div class="font-bold text-white">{{ quality.snr.toFixed(2) }}</div>
      </div>
      <div class="bg-gray-700 rounded p-2">
        <div class="text-gray-400">数据完整度</div>
        <div class="font-bold text-white">{{ (quality.data_completeness * 100).toFixed(1) }}%</div>
      </div>
      <div class="bg-gray-700 rounded p-2">
        <div class="text-gray-400">噪声水平 (RMS)</div>
        <div class="font-bold text-white">{{ quality.noise_level.toFixed(5) }}</div>
      </div>
      <div class="bg-gray-700 rounded p-2">
        <div class="text-gray-400">削波占比</div>
        <div class="font-bold" :class="quality.clip_ratio > 0.01 ? 'text-yellow-400' : 'text-white'">
          {{ (quality.clip_ratio * 100).toFixed(2) }}%
        </div>
      </div>
      <div class="bg-gray-700 rounded p-2">
        <div class="text-gray-400">振幅范围</div>
        <div class="font-bold text-white">{{ quality.amplitude_range.toFixed(4) }}</div>
      </div>
    </div>

    <div v-if="quality.issues.length" class="space-y-2">
      <h4 class="text-xs font-bold text-gray-300 border-b border-gray-700 pb-1">
        问题诊断 ({{ quality.issues.length }})
      </h4>
      <div
        v-for="issue in quality.issues"
        :key="issue.code"
        class="bg-gray-700 rounded p-2 text-xs space-y-1"
      >
        <div class="flex items-center gap-2">
          <span
            class="px-2 py-0.5 rounded text-xs font-bold uppercase"
            :class="severityClass(issue.severity)"
          >
            {{ severityLabel(issue.severity) }}
          </span>
          <span class="font-mono text-gray-400">{{ issue.code }}</span>
        </div>
        <div class="text-gray-200">{{ issue.description }}</div>
        <div v-if="issue.suggestion" class="text-gray-400 italic">
          💡 {{ issue.suggestion }}
        </div>
      </div>
    </div>

    <div v-else class="text-green-400 text-xs text-center py-2">
      ✓ 未检测到明显质量问题
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WaveformQuality } from '../types'

const props = defineProps<{
  quality: WaveformQuality | null
}>()

const gradeClass = computed(() => {
  if (!props.quality) return 'bg-gray-600 text-gray-300'
  switch (props.quality.grade) {
    case 'A': return 'bg-green-500 text-white'
    case 'B': return 'bg-blue-500 text-white'
    case 'C': return 'bg-yellow-500 text-black'
    case 'D': return 'bg-orange-500 text-white'
    case 'F': return 'bg-red-500 text-white'
    default: return 'bg-gray-600 text-gray-300'
  }
})

const scoreColor = computed(() => {
  if (!props.quality) return '#6b7280'
  const s = props.quality.overall_score
  if (s >= 85) return '#22c55e'
  if (s >= 70) return '#3b82f6'
  if (s >= 55) return '#eab308'
  if (s >= 40) return '#f97316'
  return '#ef4444'
})

const textColor = computed(() => {
  if (!props.quality) return 'text-gray-300'
  switch (props.quality.grade) {
    case 'A': return 'text-green-400'
    case 'B': return 'text-blue-400'
    case 'C': return 'text-yellow-400'
    case 'D': return 'text-orange-400'
    case 'F': return 'text-red-400'
    default: return 'text-gray-300'
  }
})

const usabilityLabel = computed(() => {
  if (!props.quality) return '—'
  const map: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    fair: '一般',
    poor: '较差',
    unusable: '不可用'
  }
  return map[props.quality.usability] || props.quality.usability
})

function severityClass(sev: string) {
  switch (sev) {
    case 'critical': return 'bg-red-600 text-white'
    case 'high': return 'bg-orange-600 text-white'
    case 'medium': return 'bg-yellow-600 text-black'
    case 'low': return 'bg-gray-500 text-white'
    default: return 'bg-gray-500 text-white'
  }
}

function severityLabel(sev: string) {
  const map: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低'
  }
  return map[sev] || sev
}
</script>
