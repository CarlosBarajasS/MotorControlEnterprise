export interface LayoutCell {
  cameraId: number;
  col: number;
  row: number;
  colspan: number;
  rowspan: number;
}

export interface LayoutConfig {
  totalCols: number;
  cells: LayoutCell[];
}

export interface ClientLayout {
  id: number;
  name: string;
  isDefault: boolean;
  config: string; // JSON string de LayoutConfig
  createdAt: string;
  updatedAt: string;
}
