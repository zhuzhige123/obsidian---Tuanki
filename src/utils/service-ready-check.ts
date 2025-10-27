/**
 * 服务就绪检查工具
 * 用于解决插件初始化时序竞争问题
 */

/**
 * 等待服务就绪
 * @param getter 获取服务的函数
 * @param serviceName 服务名称（用于日志）
 * @param maxWait 最大等待时间（毫秒）
 * @param checkInterval 检查间隔（毫秒）
 * @returns 已就绪的服务实例
 * @throws 超时错误
 */
export async function waitForService<T>(
  getter: () => T | undefined | null,
  serviceName: string,
  maxWait: number = 5000,
  checkInterval: number = 50
): Promise<T> {
  const startTime = Date.now();
  
  // 立即检查一次
  const immediateResult = getter();
  if (immediateResult !== undefined && immediateResult !== null) {
    console.log(`[ServiceReady] ${serviceName} 已就绪（立即可用）`);
    return immediateResult;
  }
  
  console.log(`[ServiceReady] 等待 ${serviceName} 初始化...`);
  
  // 轮询等待
  while (Date.now() - startTime < maxWait) {
    const service = getter();
    if (service !== undefined && service !== null) {
      const waitTime = Date.now() - startTime;
      console.log(`[ServiceReady] ${serviceName} 已就绪（等待 ${waitTime}ms）`);
      return service;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  // 超时
  const error = new Error(
    `Service ${serviceName} initialization timeout after ${maxWait}ms`
  );
  console.error(`[ServiceReady] ${serviceName} 初始化超时`, error);
  throw error;
}

/**
 * 安全地调用服务方法
 * @param getter 获取服务的函数
 * @param serviceName 服务名称
 * @param method 要调用的方法
 * @param fallback 失败时的回退值
 * @returns 方法执行结果或回退值
 */
export async function safeServiceCall<T, R>(
  getter: () => T | undefined | null,
  serviceName: string,
  method: (service: T) => Promise<R>,
  fallback: R
): Promise<R> {
  try {
    const service = await waitForService(getter, serviceName);
    return await method(service);
  } catch (error) {
    console.error(`[ServiceReady] 安全调用 ${serviceName} 失败:`, error);
    return fallback;
  }
}

/**
 * 同步检查服务是否就绪
 * @param getter 获取服务的函数
 * @returns 服务是否可用
 */
export function isServiceReady<T>(getter: () => T | undefined | null): boolean {
  const service = getter();
  return service !== undefined && service !== null;
}

/**
 * 带重试的服务调用
 * @param getter 获取服务的函数
 * @param serviceName 服务名称
 * @param method 要调用的方法
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试延迟（毫秒）
 */
export async function retryServiceCall<T, R>(
  getter: () => T | undefined | null,
  serviceName: string,
  method: (service: T) => Promise<R>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<R> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const service = await waitForService(getter, serviceName);
      return await method(service);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[ServiceReady] ${serviceName} 调用失败 (尝试 ${attempt}/${maxRetries}):`,
        error
      );
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  throw lastError || new Error(`Service ${serviceName} call failed after ${maxRetries} retries`);
}

