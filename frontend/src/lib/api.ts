import axios from 'axios'
import type { Session, TableMeta, TableData, Constant, DiffEntry, ChecksumStatus } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const createSession = async (binFile: File, xdfFile: File): Promise<Session> => {
  const form = new FormData()
  form.append('bin_file', binFile)
  form.append('xdf_file', xdfFile)
  const { data } = await api.post('/session/create', form)
  return data
}

export const listTables = async (fileId: string): Promise<TableMeta[]> => {
  const { data } = await api.get(`/tables/${fileId}`)
  return data.tables
}

export const getTable = async (fileId: string, tableId: string): Promise<TableData> => {
  const { data } = await api.get(`/table/${fileId}/${tableId}`)
  return data
}

export const writeTable = async (
  fileId: string,
  tableId: string,
  values: number[][]
): Promise<void> => {
  await api.put(`/table/${fileId}/${tableId}`, { values })
}

export const listConstants = async (fileId: string): Promise<Constant[]> => {
  const { data } = await api.get(`/constants/${fileId}`)
  return data.constants
}

export const writeConstant = async (fileId: string, constantId: string, value: number): Promise<void> => {
  await api.put(`/constant/${fileId}/${constantId}`, { value })
}

export const getDiff = async (fileId: string): Promise<DiffEntry[]> => {
  const { data } = await api.get(`/diff/${fileId}`)
  return data.diff
}

export const getChecksumStatus = async (fileId: string): Promise<ChecksumStatus> => {
  const { data } = await api.get(`/checksum/status/${fileId}`)
  return data
}

export const fixChecksums = async (fileId: string): Promise<void> => {
  await api.post(`/checksum/fix/${fileId}`)
}

export const exportBin = (fileId: string): string => `/api/export/${fileId}`

export const deleteSession = async (fileId: string): Promise<void> => {
  await api.delete(`/session/${fileId}`)
}
