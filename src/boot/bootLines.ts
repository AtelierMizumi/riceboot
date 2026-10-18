const OK = '[  OK  ]'

const UNITS = [
  'Started Journal Service.',
  'Mounted Temporary Directory /tmp.',
  'Started Load Kernel Modules.',
  'Finished Coldplug All udev Devices.',
  'Reached target Local File Systems.',
  'Started Network Configuration.',
  'Reached target Network.',
  'Started IndexedDB Virtual Filesystem.',
  'Started WebGL Compositor Backend.',
  'Started D-Bus System Message Bus.',
  'Started PipeWire Multimedia Service.',
  'Started User Login Management.',
  'Started Hyprland Session for user.',
  'Started Waybar.',
  'Reached target Multi-User System.',
]

/** Fake systemd boot log shown while the desktop loads. */
export function bootLines(): string[] {
  return [
    'Welcome to Arch Linux!',
    '',
    ...UNITS.map((u) => `${OK} ${u}`),
    `${OK} Reached target Graphical Interface.`,
  ]
}
