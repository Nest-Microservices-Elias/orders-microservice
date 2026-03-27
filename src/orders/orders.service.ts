import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { CreateOrderDto } from './dto/create-order.dto'
import { PrismaService } from 'src/prisma.service'
import { ClientProxy, RpcException } from '@nestjs/microservices'
import { OrderPaginationDto } from './dto/order-pagination.dto'
import { ChangeOrderStatusDto, PaidOrderDto } from './dto'
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config'
import { firstValueFrom } from 'rxjs'
import { OrderWithProducts } from './interfaces/order-with.products.interface'

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    @Inject(NATS_SERVICE) private client: ClientProxy,
  ) {}
  private logger = new Logger('orders-service')
  async create(createOrderDto: CreateOrderDto) {
    try {
      //1. confirmar los ids de los productos
      const productIds = createOrderDto.items.map((item) => item.productId)
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      )
      //2. calculos de los valores
      const totalAmount = createOrderDto.items.reduce((acc, ordenItem) => {
        const price = products.find(
          (product) => product.id === ordenItem.productId,
        ).price
        return acc + price * ordenItem.quantity
      }, 0)
      const totalItems = createOrderDto.items.reduce((acc, ordenItem) => {
        return acc + ordenItem.quantity
      }, 0)

      //3. crear una transaccion de base de datos (como una transaccion )
      const order = await this.prisma.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      })

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      }
    } catch (e) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Check logs ${e}`,
      })
    }
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
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    })

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with if ${id} not found`,
      })
    }

    const productIds = order.OrderItem.map((orderItem) => orderItem.productId)
    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds),
    )
    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)
          .name,
      })),
    }
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

  async createPaymentSession(order: OrderWithProducts) {
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    )

    return paymentSession
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    this.logger.log('Order Paid')
    this.logger.log(paidOrderDto)
    await this.prisma.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,
        // RELACION CON LA TABLA ORDERRECEIPT
        orderReceipts: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
    })
  }
}
