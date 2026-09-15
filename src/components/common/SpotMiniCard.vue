<template>
  <div class="mini">
    <span>{{ spot.name }}</span>
    <span>{{ startTime }}-{{ endTime }} · {{ formatCurrency(spot.price) }}</span>
  </div>
</template>
<script setup lang="ts">
import type { Spot } from '../../models/spot';
import { formatCurrency } from '../../utils/formatters';
withDefaults(defineProps<{ spot: Spot; startTime?: string; endTime?: string }>(), { startTime: '--:--', endTime: '--:--' });
</script>
<style scoped>
.mini { display: flex; justify-content: space-between; padding: 10px 12px; border: 1px dashed #a8b8a1; border-radius: 8px; margin-bottom: 8px; background: #fff; }
</style>
