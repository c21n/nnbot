export type ProfileValue = string | string[] | boolean | number

export interface ExtractedUserInfo {
  type: 'basic_info' | 'preference' | 'habit' | 'event'
  key: string
  value: ProfileValue
  confidence: number
}
