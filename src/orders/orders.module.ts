import { Module } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'
import { PrismaService } from 'src/prisma.service'
import { NatsModule } from 'src/transports/nats.module'

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService],
  imports: [NatsModule],
})
export class OrdersModule {}
