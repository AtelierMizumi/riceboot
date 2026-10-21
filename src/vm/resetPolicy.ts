/** Reset restarts the VM when it is running, loading or failed. In shell mode it only clears the saved changes. */
export function shouldRestartAfterReset(mode: 'shell' | 'loading' | 'linux' | 'error'): boolean {
  return mode !== 'shell'
}
