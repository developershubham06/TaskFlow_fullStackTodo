export const decodeQR = (qrData: string): { tableId: string; restaurantId?: string } => {
  // Simple parser; integrate qrcode lib later
  return { tableId: qrData.split('-')[1] || 'default' };
};