<template>
  <div class="history-panel">
    <div class="history-header">
      <h2>Query History</h2>
      <button
        v-if="historyStore.entries.length > 0"
        class="clear-button"
        @click="handleClearHistory"
        title="Clear all history"
      >
        Clear All
      </button>
    </div>

    <div v-if="historyStore.entries.length === 0" class="empty-state">
      <p>No query history yet</p>
      <p class="hint">Execute queries to see them appear here</p>
    </div>

    <div v-else class="history-list">
      <div
        v-for="entry in historyStore.sortedEntries"
        :key="entry.id"
        class="history-entry"
        :class="{ error: !entry.success }"
        @click="handleEntryClick(entry)"
      >
        <div class="entry-header">
          <div class="entry-status">
            <span v-if="entry.success" class="status-icon success" title="Success">✓</span>
            <span v-else class="status-icon error" title="Failed">✗</span>
            <span class="query-type" v-if="entry.queryType">{{ entry.queryType }}</span>
            <span class="query-type unknown" v-else>FAILED</span>
          </div>
          <button
            class="delete-button"
            @click.stop="handleDeleteEntry(entry.id)"
            title="Delete entry"
          >
            ×
          </button>
        </div>

        <div class="entry-query">
          <code>{{ truncateQuery(entry.query) }}</code>
        </div>

        <div class="entry-details">
          <div class="detail">
            <span class="label">Backend:</span>
            <span class="value">{{ entry.backendName }}</span>
          </div>
          <div class="detail">
            <span class="label">Time:</span>
            <span class="value">{{ formatTimestamp(entry.executedAt) }}</span>
          </div>
          <div class="detail" v-if="entry.duration !== null">
            <span class="label">Duration:</span>
            <span class="value">{{ formatDuration(entry.duration) }}</span>
          </div>
          <div class="detail" v-if="entry.success && entry.resultCount !== null">
            <span class="label">Results:</span>
            <span class="value">{{ entry.resultCount }}</span>
          </div>
          <div class="detail error-detail" v-if="!entry.success && entry.error">
            <span class="label">Error:</span>
            <span class="value error-text">{{ truncateError(entry.error) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHistoryStore } from '@/stores/history'
import { useTabsStore } from '@/stores/tabs'
import type { QueryHistoryEntry } from '@/stores/history'

const historyStore = useHistoryStore()
const tabsStore = useTabsStore()

// Restore history on component mount
historyStore.restoreFromLocalStorage()

function handleClearHistory() {
  if (confirm('Are you sure you want to clear all query history?')) {
    historyStore.clearHistory()
  }
}

function handleDeleteEntry(id: string) {
  historyStore.deleteEntry(id)
}

function handleEntryClick(entry: QueryHistoryEntry) {
  // Create a new tab with the query from history
  tabsStore.createTab({
    query: entry.query,
    backendId: entry.backendId,
  })
}

function truncateQuery(query: string, maxLength: number = 100): string {
  const cleaned = query.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength) + '...'
}

function truncateError(error: string, maxLength: number = 80): string {
  if (error.length <= maxLength) return error
  return error.substring(0, maxLength) + '...'
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return `${minutes}m ${seconds}s`
}
</script>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow: hidden;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.clear-button {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-button:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-secondary);
  background: var(--color-background-secondary);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-state p {
  margin: 4px 0;
  font-size: 14px;
}

.empty-state .hint {
  font-size: 12px;
  opacity: 0.7;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-entry {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.history-entry:hover {
  border-color: var(--color-accent);
  background: var(--color-background-tertiary);
}

.history-entry.error {
  border-color: rgba(255, 100, 100, 0.3);
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.entry-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-icon {
  font-size: 12px;
  font-weight: bold;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.status-icon.success {
  color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.status-icon.error {
  color: #f44336;
  background: rgba(244, 67, 54, 0.1);
}

.query-type {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--color-accent);
  color: white;
  text-transform: uppercase;
}

.query-type.unknown {
  background: #f44336;
}

.delete-button {
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-button:hover {
  color: #f44336;
  background: rgba(244, 67, 54, 0.1);
}

.entry-query {
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--color-background);
  border-radius: 4px;
  font-size: 12px;
  overflow: hidden;
}

.entry-query code {
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.entry-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail {
  display: flex;
  gap: 6px;
  font-size: 11px;
}

.detail .label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.detail .value {
  color: var(--color-text-primary);
}

.error-detail .value.error-text {
  color: #f44336;
  font-family: monospace;
  font-size: 10px;
}
</style>
