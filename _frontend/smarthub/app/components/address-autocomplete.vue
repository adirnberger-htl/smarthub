<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useSmarthubApi } from '../composables/use-smarthub-api'
import type { AutocompleteResult } from '../composables/use-smarthub-api'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { autocompletePlace } = useSmarthubApi()

const inputValue = ref(props.modelValue)
const suggestions = ref<AutocompleteResult[]>([])
const showSuggestions = ref(false)
const loading = ref(false)
let debounceTimeout: any = null

watch(() => props.modelValue, (newVal) => {
  if (newVal !== inputValue.value) {
    inputValue.value = newVal
  }
})

const fetchSuggestions = async (query: string) => {
  if (!query || query.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }
  
  loading.value = true
  try {
    const results = await autocompletePlace(query)
    suggestions.value = results
    showSuggestions.value = results.length > 0
  } catch (e) {
    console.error('Failed to fetch suggestions', e)
    suggestions.value = []
  } finally {
    loading.value = false
  }
}

const onInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value
  inputValue.value = value
  
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(() => {
    fetchSuggestions(value)
  }, 300)
}

const commitValue = (val: string) => {
  if (val !== props.modelValue) {
    emit('update:modelValue', val)
  }
}

const selectSuggestion = (desc: string) => {
  inputValue.value = desc
  commitValue(desc)
  showSuggestions.value = false
}

// Commit value synchronously on blur so buttons clicked immediately (e.g. Auto-Configure) see the latest address,
// then hide dropdown after a short delay so suggestion click registers
const onBlur = () => {
  commitValue(inputValue.value)
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const onKeydownEnter = () => {
  commitValue(inputValue.value)
  showSuggestions.value = false
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimeout)
})
</script>

<template>
  <div class="autocomplete-wrapper" :class="{ 'is-disabled': disabled }">
    <input
      type="text"
      class="autocomplete-input"
      :value="inputValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @blur="onBlur"
      @keydown.enter="onKeydownEnter"
      @focus="() => { if (suggestions.length > 0) showSuggestions = true }"
    />
    <div v-if="loading" class="autocomplete-loading">...</div>
    
    <ul v-if="showSuggestions && !disabled" class="autocomplete-dropdown">
      <li 
        v-for="s in suggestions" 
        :key="s.place_id" 
        class="autocomplete-item"
        @mousedown.prevent="selectSuggestion(s.description)"
      >
        {{ s.description }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.autocomplete-wrapper {
  position: relative;
  display: flex;
  flex: 1;
}

.autocomplete-wrapper.is-disabled {
  opacity: 0.5;
}

.autocomplete-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-base);
  background: var(--bg-surface-hover);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-primary-strong);
  transition: all 0.2s;
}

.autocomplete-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: white;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.autocomplete-input:disabled {
  background-color: var(--border-light);
  cursor: not-allowed;
}

.autocomplete-loading {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-light);
  font-size: 0.8rem;
}

.autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid var(--border-base);
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  z-index: 50;
  list-style: none;
  padding: 0;
  max-height: 250px;
  overflow-y: auto;
}

.autocomplete-item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-primary-alt-2);
  border-bottom: 1px solid var(--border-light);
}

.autocomplete-item:last-child {
  border-bottom: none;
}

.autocomplete-item:hover {
  background-color: var(--border-light);
}
</style>
