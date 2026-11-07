import Taro from '@tarojs/taro'
import { supabase } from './config'
import { withTimeout } from './timeout'

export async function uploadRobotPhoto(userId: string): Promise<string> {
  const choice = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
  const response = await fetch(choice.tempFilePaths[0])
  const blob = await response.blob()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG, or WebP image under 5 MB.')
  }
  const extension = blob.type.split('/')[1]
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
  const { error } = await withTimeout(supabase.storage.from('robot-photos').upload(path, blob, {
    contentType: blob.type, upsert: false
  }))
  if (error) throw error
  return path
}

export async function robotPhotoUrl(path: string): Promise<string> {
  const { data, error } = await withTimeout(supabase.storage.from('robot-photos').createSignedUrl(path, 3600))
  if (error) throw error
  return data.signedUrl
}
