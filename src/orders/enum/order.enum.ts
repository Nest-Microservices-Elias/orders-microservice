import { OrderStatus } from 'generated/prisma/enums'

export const OrderStatusList = [
  OrderStatus.PENDING,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
]
