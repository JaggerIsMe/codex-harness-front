import type { InjectionKey, Ref } from 'vue'
export interface Rule {
  required?: boolean
  message?: string
  pattern?: RegExp
  trigger?: string
  validator?: (rule: Rule, value: unknown, callback: (error?: Error) => void) => void
}
export type FormRules = Record<string, Rule[]>
export interface FormHandle {
  validate: () => Promise<boolean>
  clearValidate: (fields?: string[]) => void
  validateField: (field: string) => Promise<boolean>
}
export const formContext: InjectionKey<Ref<Record<string, string>>> = Symbol('form')
