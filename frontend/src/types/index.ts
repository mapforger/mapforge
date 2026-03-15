export interface Session {
  file_id: string
  bin_name: string
  xdf_name: string
  bin_size: number
  xdf_title: string
  table_count: number
  constant_count: number
}

export interface TableMeta {
  id: string
  title: string
  description: string
  category: string
  is_3d: boolean
  rows: number
  cols: number
}

export interface AxisData {
  units: string
  values: number[]
}

export interface TableData {
  id: string
  title: string
  description: string
  category: string
  is_3d: boolean
  x_axis: AxisData
  y_axis: AxisData | null
  z_values: number[][]
  z_units: string
}

export interface Constant {
  id: string
  title: string
  description: string
  category: string
  value: number
  units: string
  error?: string
}

export interface DiffEntry {
  address: string
  original: string
  modified: string
  description: string
}
