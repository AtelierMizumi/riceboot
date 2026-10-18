import type { Command } from '../types'
import { fastfetch } from './fastfetch'
import { cat, cd, echo, ls, mkdir, pwd, rm, touch } from './fs'
import { hyprctl } from './hyprctl'
import { clear, help } from './misc'

export const COMMANDS: Record<string, Command> = {
  ls, cd, pwd, cat, echo, mkdir, rm, touch, clear, help, fastfetch, neofetch: fastfetch, hyprctl,
}
