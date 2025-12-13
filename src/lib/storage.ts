import { supabaseBrowser } from './supabase'

export interface FileUploadOptions {
  bucket: string
  path: string
  file: File
  options?: {
    cacheControl?: string
    upsert?: boolean
  }
}

export interface FileDownloadOptions {
  bucket: string
  path: string
}

/**
 * Servicio de Storage para Supabase
 */
export class StorageService {
  /**
   * Sube un archivo a Supabase Storage
   */
  static async uploadFile({ bucket, path, file, options }: FileUploadOptions) {
    const supabase = supabaseBrowser()
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: options?.cacheControl || '3600',
          upsert: options?.upsert || false,
        })

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error uploading file:', error)
      return { data: null, error }
    }
  }

  /**
   * Descarga un archivo de Supabase Storage
   */
  static async downloadFile({ bucket, path }: FileDownloadOptions) {
    const supabase = supabaseBrowser()
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path)

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error downloading file:', error)
      return { data: null, error }
    }
  }

  /**
   * Obtiene la URL pública de un archivo
   */
  static getPublicUrl(bucket: string, path: string) {
    const supabase = supabaseBrowser()
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path)

    return data.publicUrl
  }

  /**
   * Elimina un archivo de Supabase Storage
   */
  static async deleteFile(bucket: string, path: string) {
    const supabase = supabaseBrowser()
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .remove([path])

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error deleting file:', error)
      return { data: null, error }
    }
  }

  /**
   * Lista archivos en un bucket
   */
  static async listFiles(bucket: string, path?: string) {
    const supabase = supabaseBrowser()
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(path)

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Error listing files:', error)
      return { data: null, error }
    }
  }
}

/**
 * Nombres de buckets predefinidos
 * Personaliza según tu proyecto
 */
export const BUCKETS = {
  DOCUMENTS: 'documents',
  AVATARS: 'avatars',
  UPLOADS: 'uploads',
} as const

