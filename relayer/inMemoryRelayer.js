const crypto = require('crypto');

class InMemoryRelayer {
  constructor() {
    this.orders = new Map();
    this.resolvers = [];
    this.orderCallbacks = new Map();
  }

  registerResolver(resolver) {
    this.resolvers.push(resolver);
    return this.resolvers.length - 1;
  }

  async submitOrder(order) {
    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const orderData = {
      id: orderId,
      ...order,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.orders.set(orderId, orderData);
    console.log(`Order submitted: ${orderId}`);

    // Notify all resolvers
    for (const resolver of this.resolvers) {
      try {
        await resolver.handleNewOrder({ ...orderData });
      } catch (error) {
        console.error(`Error notifying resolver:`, error);
      }
    }

    return {
      success: true,
      orderId,
      status: 'pending'
    };
  }

  updateOrderStatus(orderId, status, data = {}) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');

    const updatedOrder = {
      ...order,
      ...data,
      status,
      updatedAt: new Date().toISOString()
    };

    this.orders.set(orderId, updatedOrder);
    console.log(`Order ${orderId} updated to status: ${status}`);

    // Trigger any registered callbacks
    if (this.orderCallbacks.has(orderId)) {
      this.orderCallbacks.get(orderId)(updatedOrder);
    }

    return updatedOrder;
  }

  getOrder(orderId) {
    return this.orders.get(orderId);
  }

  onOrderUpdate(orderId, callback) {
    if (typeof orderId === 'function') {
      // Handle global callback
      this.orderCallbacks.set('global', orderId);
    } else {
      // Handle order-specific callback
      this.orderCallbacks.set(orderId, callback);
    }
  }
}

// Singleton instance
const relayer = new InMemoryRelayer();
module.exports = relayer;
