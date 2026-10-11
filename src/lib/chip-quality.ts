export interface ChipCapabilities {
  width: number
  memory?: number
  cores?: number
  saveData?: boolean
  connection?: string
  reduced?: boolean
}
export function chipQuality(device: ChipCapabilities) {
  const manual = Boolean(device.saveData || ['slow-2g', '2g'].includes(device.connection ?? '') ||
    (device.memory !== undefined && device.memory <= 2) || (device.cores !== undefined && device.cores <= 2))
  const economy = manual || (device.memory !== undefined && device.memory <= 4)
  const tier = economy ? 'economy' : device.width < 760 || device.reduced ? 'balanced' : 'full'
  return { tier, manual, dpr: tier === 'full' ? 2 : tier === 'balanced' ? 1.5 : 1, fps: tier === 'economy' ? 30 : 60 } as const
}
export type ChipQuality = ReturnType<typeof chipQuality>
