import { ref, readonly } from 'vue'
import { useResultsSave, type ResultsSource } from './useResultsSave'
import { useToast } from './useToast'

interface ExportFormat {
  value: string
  label: string
}

// Module-level so the Save button, the menu item, and the format picker all
// share one pending-export state regardless of which component triggers it.
const pickerFormats = ref<ExportFormat[]>([])
const isPickerOpen = ref(false)

/**
 * The "save results" flow: decide whether a format picker is needed, show it,
 * and hand the chosen format to the save routine. Components render the
 * picker from `isPickerOpen` / `pickerFormats` and call `selectFormat` or
 * `closePicker` from it.
 */
export function useResultsExport(getSource?: () => ResultsSource | null) {
  const { canSaveResults, getExportFormats, saveResults } = useResultsSave(getSource)
  const toast = useToast()

  async function requestSave(): Promise<void> {
    if (!canSaveResults()) {
      toast.warning('No results to save. Execute a query first.')
      return
    }

    const formats = getExportFormats()

    // A single format (ASK queries) needs no picker
    if (formats.length === 1) {
      await saveResults(formats[0].value)
      return
    }

    pickerFormats.value = formats
    isPickerOpen.value = true
  }

  function closePicker(): void {
    isPickerOpen.value = false
  }

  async function selectFormat(format: string): Promise<void> {
    isPickerOpen.value = false
    await saveResults(format)
  }

  return {
    canSaveResults,
    requestSave,
    selectFormat,
    closePicker,
    pickerFormats: readonly(pickerFormats),
    isPickerOpen: readonly(isPickerOpen),
  }
}
