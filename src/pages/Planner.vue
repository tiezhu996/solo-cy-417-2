<template>
  <main class="page">
    <h1>行程编排</h1>
    <section class="band">
      <p class="muted">每个景点按两小时从最早可容纳时段排入，冲突依次顺延；超出闭园时间或预算时本次拖拽整体不生效。</p>
      <p v-if="!day" class="muted">这一天还没有安排，先到“景点探索”加入景点。</p>
      <div v-else ref="listEl">
        <SpotMiniCard v-for="spot in daySpots" :key="spot.id + spot.start_time" :spot="spot" :start-time="spot.start_time" :end-time="spot.end_time" />
      </div>
    </section>
    <DayTimeline v-if="day" :day="day" :spots="spotStore.spots" />
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Sortable, { type SortableEvent } from 'sortablejs';
import { useSpotStore } from '../stores/spotStore';
import { useDayPlanStore } from '../stores/dayPlanStore';
import SpotMiniCard from '../components/common/SpotMiniCard.vue';
import DayTimeline from '../components/common/DayTimeline.vue';
import type { Spot } from '../models/spot';

type PlannedSpot = Spot & { start_time: string; end_time: string };
const route = useRoute();
const spotStore = useSpotStore();
const dayPlanStore = useDayPlanStore();
const listEl = ref<HTMLElement>();
const tripId = String(route.params.tripId);
const dayIndex = Number(route.params.dayIndex || 1);
// 只读取当天，避免进入编排页就创建空行程；真正落盘发生在排程成功后
const day = computed(() => dayPlanStore.findDay(tripId, dayIndex));
const daySpots = computed(() => {
  if (!day.value) return [];
  return day.value.items
    .map((item) => {
      const spot = spotStore.spots.find((candidate) => candidate.id === item.spot_id);
      return spot ? ({ ...spot, start_time: item.start_time, end_time: item.end_time } as PlannedSpot) : null;
    })
    .filter(Boolean) as PlannedSpot[];
});
onMounted(() => {
  if (listEl.value) {
    // 拖拽开始时记录被拖节点在原顺序中的后继节点；调整被拒绝时据此插回，向上/向下拖动都回到原位置
    let dragNextSibling: Node | null = null;
    new Sortable(listEl.value, {
      animation: 150,
      onStart: (evt: SortableEvent) => {
        dragNextSibling = evt.item.nextSibling;
      },
      onEnd: (evt: SortableEvent) => {
        const from = evt.oldIndex ?? 0;
        const to = evt.newIndex ?? 0;
        // store 拒绝（闭园/超预算）时 state、时间线、localStorage 都未变，把被 Sortable 移动的 DOM 插回原锚点
        if (!dayPlanStore.reorder(tripId, dayIndex, from, to) && evt.item.parentElement) {
          evt.item.parentElement.insertBefore(evt.item, dragNextSibling);
        }
        dragNextSibling = null;
      },
    });
  }
});
</script>
