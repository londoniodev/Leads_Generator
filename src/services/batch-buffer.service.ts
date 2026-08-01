import { redisConnection } from '../queue/lead.queue.js';

export class BatchBufferService {
  /**
   * Acumula perfiles sociales en una lista Redis de forma atómica.
   * Si la lista alcanza o supera batchSize, extrae el lote completo y lo retorna.
   * Si no alcanza el límite, retorna null.
   */
  public static async addToBatch<T = any>(
    platform: string,
    profileData: T,
    batchSize: number = 50
  ): Promise<T[] | null> {
    const key = `batch:${platform.toLowerCase()}`;
    const serializedData = JSON.stringify(profileData);

    try {
      // 1. Agregar elemento a la lista Redis
      const currentLength = await redisConnection.rpush(key, serializedData);

      // 2. Si alcanza o supera el tamaño objetivo del lote
      if (currentLength >= batchSize) {
        // Ejecutar transacción atómica con MULTI/EXEC para extraer los elementos y limpiar la clave
        const multi = redisConnection.multi();
        multi.lrange(key, 0, batchSize - 1);
        multi.ltrim(key, batchSize, -1);

        const results = await multi.exec();

        if (!results || results.length === 0) {
          return null;
        }

        const [errLrange, rawItems] = results[0] as [Error | null, string[]];

        if (errLrange || !Array.isArray(rawItems) || rawItems.length === 0) {
          return null;
        }

        // Deserializar elementos JSON
        const parsedBatch: T[] = rawItems.map((item) => JSON.parse(item));
        return parsedBatch;
      }

      return null;
    } catch (error: any) {
      console.error(`[BatchBufferService] Error en búfer Redis para la plataforma ${platform}:`, error?.message || error);
      return null;
    }
  }

  /**
   * Vacía manualmente cualquier lote remanente almacenado en Redis para una plataforma dada.
   */
  public static async flushBatch<T = any>(platform: string): Promise<T[]> {
    const key = `batch:${platform.toLowerCase()}`;
    try {
      const items = await redisConnection.lrange(key, 0, -1);
      if (items && items.length > 0) {
        await redisConnection.del(key);
        return items.map((item) => JSON.parse(item));
      }
      return [];
    } catch (error: any) {
      console.error(`[BatchBufferService] Error al vaciar búfer Redis para ${platform}:`, error?.message || error);
      return [];
    }
  }
}
