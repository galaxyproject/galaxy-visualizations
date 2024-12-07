<script setup>
import { ref, onMounted } from "vue";
import { renderReactComponent } from "./ReactLinearGenomeView";

// Define props for the Vue component
const props = defineProps({
  jbrowseProps: Object,
});

const reactRoot = ref(null);

onMounted(() => {
  if (reactRoot.value) {
    renderReactComponent(reactRoot.value, props.jbrowseProps);
  }
});
</script>

<template>
  <div>
    <div ref="reactRoot"></div>
  </div>
</template>
