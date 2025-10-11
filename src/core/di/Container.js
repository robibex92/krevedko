/**
 * Simple Dependency Injection Container
 */
export class Container {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  /**
   * Register a service
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that creates the service
   * @param {boolean} singleton - If true, service will be instantiated once
   */
  register(name, factory, singleton = true) {
    this.services.set(name, { factory, singleton });
  }

  /**
   * Register a value directly (always singleton)
   */
  registerValue(name, value) {
    this.singletons.set(name, value);
  }

  /**
   * Resolve a service
   */
  resolve(name) {
    // Check if it's a singleton that was already created
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Get service definition
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not found in container`);
    }

    // Create instance
    const instance = service.factory(this);

    // Store if singleton
    if (service.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }

  /**
   * Check if service exists
   */
  has(name) {
    return this.services.has(name) || this.singletons.has(name);
  }

  /**
   * Clear all services and singletons
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
  }
}

// Global container instance
export const container = new Container();
