import { ref, readonly, computed } from 'vue'
import { useResultsSave, type ResultsSource } from './useResultsSave'
import { useToast } from './useToast'

interface ExportFormat {
  value: string
  label: string
}

export type ExportAction = 'save' | 'copy'

// Module-level so the toolbar buttons, the menu item, and the format picker
// all share one pending-export state regardless of which component triggers it.
const pickerFormats = ref<ExportFormat[]>([])
const isPickerOpen = ref(false)
const pendingAction = ref<ExportAction>('save')

const PICKER_TITLES: Record<ExportAction, string> = {
  save: 'Save results as',
  copy: 'Copy results as',
}

/**
 * The "save results" and "copy results" flows: decide whether a format picker
 * is needed, show it, and hand the chosen format to the save or copy routine.
 * Components render the picker from `isPickerOpen` / `pickerFormats` /
 * `pickerTitle` and call `selectFormat` or `closePicker` from it.
 */
export function useResultsExport(getSource?: () => ResultsSource | null) {
  const { canSaveResults, getExportFormats, saveResults, copyResults } = useResultsSave(getSource)
  const toast = useToast()

  async function request(action: ExportAction): Promise<void> {
    if (!canSaveResults()) {
      toast.warning(`No results to ${action}. Execute a query first.`)
      return
    }

    const formats = getExportFormats()
    pendingAction.value = action

    // A single format needs no picker
    if (formats.length === 1) {
      await run(action, formats[0].value)
      return
    }

    pickerFormats.value = formats
    isPickerOpen.value = true
  }

  function run(action: ExportAction, format: string): Promise<boolean> {
    return action === 'copy' ? copyResults(format) : saveResults(format)
  }

  function requestSave(): Promise<void> {
    return request('save')
  }

  function requestCopy(): Promise<void> {
    return request('copy')
  }

  function closePicker(): void {
    isPickerOpen.value = false
  }

  async function selectFormat(format: string): Promise<void> {
    isPickerOpen.value = false
    await run(pendingAction.value, format)
  }

  return {
    canSaveResults,
    requestSave,
    requestCopy,
    selectFormat,
    closePicker,
    pickerFormats: readonly(pickerFormats),
    isPickerOpen: readonly(isPickerOpen),
    pickerTitle: computed(() => PICKER_TITLES[pendingAction.value]),
  }
}
