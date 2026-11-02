import { ref, readonly } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
  action?: ToastAction
}

const toasts = ref<Toast[]>([])
let toastIdCounter = 0

export function useToast() {
  function show(
    message: string,
    type: ToastType = 'info',
    duration = 4000,
    action?: ToastAction
  ): string {
    const id = `toast-${++toastIdCounter}`
    const toast: Toast = {
      id,
      message,
      type,
      duration,
      ...(action ? { action } : {}),
    }

    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }

    return id
  }

  function remove(id: string): void {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  function info(message: string, duration?: number): string {
    return show(message, 'info', duration)
  }

  function success(message: string, duration?: number, action?: ToastAction): string {
    return show(message, 'success', duration, action)
  }

  function warning(message: string, duration?: number): string {
    return show(message, 'warning', duration)
  }

  function error(message: string, duration?: number): string {
    return show(message, 'error', duration)
  }

  return {
    toasts: readonly(toasts),
    show,
    remove,
    info,
    success,
    warning,
    error,
  }
}
