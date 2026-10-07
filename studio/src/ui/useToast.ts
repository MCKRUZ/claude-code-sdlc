// #25 useToast: the hook view of toastStore. `items` re-renders the region; `toast` / `dismiss`
// are the same module functions, returned here so a component has one import.
import { useSyncExternalStore } from 'react'
import type { ToastApi } from './contract'
import { dismiss, getSnapshot, subscribe, toast } from './toastStore'

export function useToast(): ToastApi {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { toast, dismiss, items }
}
