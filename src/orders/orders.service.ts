import { HttpStatus, Injectable } from '@nestjs/common'
import { CreateOrderDto } from './dto/create-order.dto'
import { PrismaService } from 'src/prisma.service'
import { RpcException } from '@nestjs/microservices'
import { OrderPaginationDto } from './dto/order-pagination.dto'
import { ChangeOrderStatusDto } from './dto'

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}
  create(createOrderDto: CreateOrderDto) {
    return this.prisma.order.create({
      data: createOrderDto,
    })
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.prisma.order.count({
      where: {
        status: orderPaginationDto.status,
      },
    })
    const currentPage = orderPaginationDto.page as number
    const perPage = orderPaginationDto.limit as number

    return {
      data: await this.prisma.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status,
        },
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      },
    }
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id },
    })

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with if ${id} not found`,
      })
    }
    return order
  }
  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto

    const order = await this.findOne(id)
    if (order.status === status) {
      return order
    }

    return this.prisma.order.update({
      where: { id },
      data: { status },
    })
  }
}
